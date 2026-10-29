import argparse
import json
import math
import sqlite3
import uuid
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

from database.repository import (
    create_recipe,
    delete_recipe,
    delete_recipe_image,
    add_recipe_image,
    get_recipe_image,
    initialize_database,
    list_categories,
    list_recipes,
    list_recipe_images,
    RecipeImageLimitError,
    RecipeNotFoundError,
    read_recipe,
    update_recipe,
)


PROJECT_ROOT = Path(__file__).resolve().parent.parent
FRONTEND_ROOT = PROJECT_ROOT / "frontend"
DEFAULT_DATABASE = PROJECT_ROOT / "data" / "recipes.sqlite3"
MAX_REQUEST_SIZE = 64 * 1024
MAX_IMAGE_SIZE = 5 * 1024 * 1024
IMAGE_TYPES = {
    "image/jpeg": (".jpg", lambda data: data.startswith(b"\xff\xd8\xff")),
    "image/png": (".png", lambda data: data.startswith(b"\x89PNG\r\n\x1a\n")),
    "image/webp": (
        ".webp",
        lambda data: len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP",
    ),
}


def parse_recipe(payload):
    if not isinstance(payload, dict):
        raise ValueError("Recipe data must be a JSON object.")

    name = payload.get("name")
    rating = payload.get("rating")
    notes = payload.get("notes", "")
    category = payload.get("category")
    steps = payload.get("steps", [])
    ingredients = payload.get("ingredients", [])
    cooking_time_minutes = payload.get("cooking_time_minutes")
    cooking_temperature_f = payload.get("cooking_temperature_f")
    servings = payload.get("servings")

    if not isinstance(name, str) or not name.strip() or len(name.strip()) > 120:
        raise ValueError("Recipe name is required and must be at most 120 characters.")
    if rating is not None and (type(rating) is not int or not 1 <= rating <= 5):
        raise ValueError("Rating must be empty or an integer from 1 to 5.")
    if not isinstance(notes, str):
        raise ValueError("Notes must be text.")
    if category is not None and not isinstance(category, str):
        raise ValueError("Category must be text or empty.")
    if category is not None:
        category = category.strip() or None
        if category is not None and len(category) > 60:
            raise ValueError("Category must be at most 60 characters.")
    if not isinstance(steps, list) or any(
        not isinstance(step, str) or not step.strip() for step in steps
    ):
        raise ValueError("Steps must be a list of non-empty text.")
    steps = [step.strip() for step in steps]
    if not isinstance(ingredients, list) or any(
        not isinstance(ingredient, str) or not ingredient.strip()
        for ingredient in ingredients
    ):
        raise ValueError("Ingredients must be a list of non-empty text.")
    ingredients = [ingredient.strip() for ingredient in ingredients]
    if cooking_time_minutes is not None and (
        type(cooking_time_minutes) is not int or cooking_time_minutes <= 0
    ):
        raise ValueError("Cooking time must be empty or a positive whole number of minutes.")
    if cooking_temperature_f is not None and (
        isinstance(cooking_temperature_f, bool)
        or not isinstance(cooking_temperature_f, (int, float))
    ):
        raise ValueError("Cooking temperature must be empty or a non-negative number in °F.")
    if cooking_temperature_f is not None:
        try:
            cooking_temperature_f = float(cooking_temperature_f)
        except OverflowError as error:
            raise ValueError(
                "Cooking temperature must be empty or a non-negative number in °F."
            ) from error
        if not math.isfinite(cooking_temperature_f) or cooking_temperature_f < 0:
            raise ValueError("Cooking temperature must be empty or a non-negative number in °F.")
    if servings is not None and (type(servings) is not int or servings <= 0):
        raise ValueError("Servings must be empty or a positive whole number.")

    return (
        name.strip(),
        rating,
        notes.strip(),
        category,
        steps,
        ingredients,
        cooking_time_minutes,
        cooking_temperature_f,
        servings,
    )


class RecipeRequestHandler(SimpleHTTPRequestHandler):
    server_version = "MiseRecipeServer/1.0"

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        path = urlsplit(self.path).path
        image_route = self._recipe_image_route(path)
        if image_route is not None:
            if not image_route:
                return
            recipe_id, image_id = image_route
            self._send_recipe_image(recipe_id, image_id)
            return
        if path == "/api/recipes":
            try:
                self._send_json(200, list_recipes(self.server.database_path))
            except sqlite3.Error:
                self._send_json(500, {"error": "Database operation failed."})
            return
        if path == "/api/categories":
            try:
                self._send_json(200, list_categories(self.server.database_path))
            except sqlite3.Error:
                self._send_json(500, {"error": "Database operation failed."})
            return
        if path.startswith("/api/recipes/"):
            recipe_id = self._recipe_id()
            if recipe_id is None:
                return
            try:
                recipe = read_recipe(self.server.database_path, recipe_id)
            except sqlite3.Error:
                self._send_json(500, {"error": "Database operation failed."})
                return
            if recipe is None:
                self._send_json(404, {"error": "Recipe not found."})
                return
            self._send_json(200, recipe)
            return
        if path.startswith("/api/"):
            self._send_json(404, {"error": "API endpoint not found."})
            return
        super().do_GET()

    def do_POST(self):
        path = urlsplit(self.path).path
        image_upload_recipe_id = self._recipe_image_upload_route(path)
        if image_upload_recipe_id is not None:
            self._upload_recipe_image(image_upload_recipe_id)
            return
        if path != "/api/recipes":
            self._send_json(404, {"error": "API endpoint not found."})
            return

        payload = self._read_json()
        if payload is None:
            return
        try:
            (
                name,
                rating,
                notes,
                category,
                steps,
                ingredients,
                cooking_time_minutes,
                cooking_temperature_f,
                servings,
            ) = parse_recipe(payload)
        except ValueError as error:
            self._send_json(400, {"error": str(error)})
            return

        try:
            recipe = create_recipe(
                self.server.database_path,
                name,
                rating,
                notes,
                category,
                steps,
                ingredients,
                cooking_time_minutes,
                cooking_temperature_f,
                servings,
            )
        except sqlite3.Error:
            self._send_json(500, {"error": "Database operation failed."})
            return
        self._send_json(201, recipe)

    def do_PUT(self):
        recipe_id = self._recipe_id()
        if recipe_id is None:
            return

        payload = self._read_json()
        if payload is None:
            return
        try:
            (
                name,
                rating,
                notes,
                category,
                steps,
                ingredients,
                cooking_time_minutes,
                cooking_temperature_f,
                servings,
            ) = parse_recipe(payload)
        except ValueError as error:
            self._send_json(400, {"error": str(error)})
            return

        try:
            recipe = update_recipe(
                self.server.database_path,
                recipe_id,
                name,
                rating,
                notes,
                category,
                steps,
                ingredients,
                cooking_time_minutes,
                cooking_temperature_f,
                servings,
            )
        except sqlite3.Error:
            self._send_json(500, {"error": "Database operation failed."})
            return
        if recipe is None:
            self._send_json(404, {"error": "Recipe not found."})
            return
        self._send_json(200, recipe)

    def do_DELETE(self):
        image_route = self._recipe_image_route(urlsplit(self.path).path)
        if image_route is not None:
            if not image_route:
                return
            self._delete_recipe_image(*image_route)
            return
        recipe_id = self._recipe_id()
        if recipe_id is None:
            return
        try:
            images = list_recipe_images(self.server.database_path, recipe_id)
            deleted = delete_recipe(self.server.database_path, recipe_id)
        except sqlite3.Error:
            self._send_json(500, {"error": "Database operation failed."})
            return
        if not deleted:
            self._send_json(404, {"error": "Recipe not found."})
            return
        try:
            for image in images:
                (self.server.image_directory / image["file_name"]).unlink(missing_ok=True)
        except OSError:
            self._send_json(500, {"error": "Recipe was deleted, but its picture files could not be removed."})
            return

        self.send_response(204)
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

    def _recipe_id(self):
        path = urlsplit(self.path).path
        prefix = "/api/recipes/"
        recipe_id = path.removeprefix(prefix) if path.startswith(prefix) else ""
        try:
            return str(uuid.UUID(recipe_id))
        except ValueError:
            self._send_json(404, {"error": "Recipe not found."})
            return None

    def _recipe_image_route(self, path):
        parts = path.split("/")
        if len(parts) != 6 or parts[1:3] != ["api", "recipes"] or parts[4] != "images":
            return None
        try:
            return str(uuid.UUID(parts[3])), str(uuid.UUID(parts[5]))
        except ValueError:
            self._send_json(404, {"error": "Recipe picture not found."})
            return ()

    def _recipe_image_upload_route(self, path):
        parts = path.split("/")
        if len(parts) != 5 or parts[1:3] != ["api", "recipes"] or parts[4] != "images":
            return None
        try:
            return str(uuid.UUID(parts[3]))
        except ValueError:
            self._send_json(404, {"error": "Recipe not found."})
            return ""

    def _upload_recipe_image(self, recipe_id):
        if not recipe_id:
            return
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self._send_json(400, {"error": "Invalid Content-Length."})
            return
        if content_length <= 0 or content_length > MAX_IMAGE_SIZE:
            self._send_json(400, {"error": "Picture must be between 1 byte and 5 MB."})
            return

        content_type = self.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
        image_type = IMAGE_TYPES.get(content_type)
        if image_type is None:
            self._send_json(400, {"error": "Pictures must be JPEG, PNG, or WebP."})
            return
        content = self.rfile.read(content_length)
        if len(content) != content_length or not image_type[1](content):
            self._send_json(400, {"error": "Picture content does not match its image format."})
            return

        image_id = str(uuid.uuid4())
        file_name = f"{image_id}{image_type[0]}"
        image_path = self.server.image_directory / file_name
        try:
            image_path.write_bytes(content)
            image = add_recipe_image(
                self.server.database_path, recipe_id, image_id, file_name, content_type
            )
        except RecipeNotFoundError:
            image_path.unlink(missing_ok=True)
            self._send_json(404, {"error": "Recipe not found."})
            return
        except RecipeImageLimitError:
            image_path.unlink(missing_ok=True)
            self._send_json(400, {"error": "A recipe can have at most 10 pictures."})
            return
        except (OSError, sqlite3.Error):
            image_path.unlink(missing_ok=True)
            self._send_json(500, {"error": "Picture could not be stored."})
            return
        self._send_json(201, image)

    def _send_recipe_image(self, recipe_id, image_id):
        try:
            image = get_recipe_image(self.server.database_path, recipe_id, image_id)
            if image is None:
                self._send_json(404, {"error": "Recipe picture not found."})
                return
            content = (self.server.image_directory / image["file_name"]).read_bytes()
        except FileNotFoundError:
            self._send_json(500, {"error": "Stored picture file is missing."})
            return
        except (OSError, sqlite3.Error):
            self._send_json(500, {"error": "Picture could not be read."})
            return

        self.send_response(200)
        self.send_header("Content-Type", image["content_type"])
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def _delete_recipe_image(self, recipe_id, image_id):
        try:
            file_name = delete_recipe_image(self.server.database_path, recipe_id, image_id)
            if file_name is None:
                self._send_json(404, {"error": "Recipe picture not found."})
                return
            (self.server.image_directory / file_name).unlink(missing_ok=True)
        except (OSError, sqlite3.Error):
            self._send_json(500, {"error": "Picture could not be removed."})
            return
        self.send_response(204)
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

    def _read_json(self):
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self._send_json(400, {"error": "Invalid Content-Length."})
            return None

        if content_length <= 0 or content_length > MAX_REQUEST_SIZE:
            self._send_json(400, {"error": "Request body must be between 1 byte and 64 KB."})
            return None

        try:
            payload = json.loads(self.rfile.read(content_length))
        except (json.JSONDecodeError, UnicodeDecodeError):
            self._send_json(400, {"error": "Request body must contain valid JSON."})
            return None
        return payload

    def _send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def create_server(host, port, database_path):
    initialize_database(database_path)
    handler = partial(RecipeRequestHandler, directory=FRONTEND_ROOT)
    server = ThreadingHTTPServer((host, port), handler)
    server.database_path = Path(database_path).resolve()
    server.image_directory = server.database_path.parent / "recipe-images"
    server.image_directory.mkdir(parents=True, exist_ok=True)
    return server


def main():
    parser = argparse.ArgumentParser(description="Run the local recipe app server.")
    parser.add_argument("--host", default="0.0.0.0", help="Network interface to bind (default: all interfaces)")
    parser.add_argument("--port", type=int, default=8000, help="Port to listen on (default: 8000)")
    parser.add_argument(
        "--database",
        type=Path,
        default=DEFAULT_DATABASE,
        help="SQLite database file (default: data/recipes.sqlite3)",
    )
    args = parser.parse_args()

    server = create_server(args.host, args.port, args.database)
    print(f"Recipe app running on http://localhost:{args.port}")
    print("On other devices, open this computer's local network IP on the same port.")
    print(f"SQLite database: {server.database_path}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping recipe app.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
