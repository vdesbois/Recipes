import json
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from backend.server import create_server


class RecipeRestApiTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.database_path = Path(self.temp_dir.name) / "recipes.sqlite3"
        self.server = create_server("127.0.0.1", 0, self.database_path)
        self.thread = threading.Thread(target=self.server.serve_forever)
        self.thread.start()
        self.base_url = f"http://127.0.0.1:{self.server.server_port}"

    def tearDown(self):
        self.server.shutdown()
        self.thread.join()
        self.server.server_close()
        self.temp_dir.cleanup()

    def request_json(self, path, method="GET", payload=None):
        data = None if payload is None else json.dumps(payload).encode("utf-8")
        request = Request(
            self.base_url + path,
            data=data,
            method=method,
            headers={"Content-Type": "application/json"},
        )
        try:
            response = urlopen(request)
        except HTTPError as error:
            response = error

        with response:
            body = response.read()
            return response.status, json.loads(body) if body else None

    def request_bytes(self, path, method, content, content_type, content_length=None):
        headers = {"Content-Type": content_type}
        if content_length is not None:
            headers["Content-Length"] = str(content_length)
        request = Request(
            self.base_url + path,
            data=content,
            method=method,
            headers=headers,
        )
        try:
            response = urlopen(request)
        except HTTPError as error:
            response = error

        with response:
            return response.status, response.headers, response.read()

    def test_rest_crud_lifecycle_and_status_codes(self):
        status, collection = self.request_json("/api/recipes")
        self.assertEqual(status, 200)
        self.assertEqual(collection, [])

        status, created = self.request_json(
            "/api/recipes",
            "POST",
            {"name": "  Tomato soup  ", "rating": None, "notes": ""},
        )
        self.assertEqual(status, 201)
        self.assertEqual(created["name"], "Tomato soup")
        self.assertIsNone(created["rating"])
        self.assertEqual(created["notes"], "")
        self.assertIsNone(created["category"])
        self.assertEqual(created["steps"], [])
        self.assertEqual(created["ingredients"], [])
        self.assertIsNone(created["cooking_time_minutes"])
        self.assertIsNone(created["cooking_temperature_f"])
        self.assertIsNone(created["servings"])

        recipe_path = f"/api/recipes/{created['id']}"
        status, fetched = self.request_json(recipe_path)
        self.assertEqual(status, 200)
        self.assertEqual(fetched, created)

        status, updated = self.request_json(
            recipe_path,
            "PUT",
            {"name": "Roasted tomato soup", "rating": 5, "notes": "Add basil."},
        )
        self.assertEqual(status, 200)
        self.assertEqual(updated, {
            "id": created["id"],
            "name": "Roasted tomato soup",
            "rating": 5,
            "notes": "Add basil.",
            "category": None,
            "cooking_time_minutes": None,
            "cooking_temperature_f": None,
            "servings": None,
            "steps": [],
            "ingredients": [],
            "images": [],
        })

        status, collection = self.request_json("/api/recipes")
        self.assertEqual(status, 200)
        self.assertEqual(collection, [updated])

        status, body = self.request_json(recipe_path, "DELETE")
        self.assertEqual(status, 204)
        self.assertIsNone(body)

        status, collection = self.request_json("/api/recipes")
        self.assertEqual(status, 200)
        self.assertEqual(collection, [])

    def test_invalid_resource_ids_and_missing_resources_return_404(self):
        for path, method, payload in (
            ("/api/recipes/not-a-uuid", "GET", None),
            ("/api/recipes/not-a-uuid", "PUT", {"name": "Soup"}),
            ("/api/recipes/not-a-uuid", "DELETE", None),
            ("/api/recipes/00000000-0000-0000-0000-000000000000", "GET", None),
            ("/api/recipes/00000000-0000-0000-0000-000000000000", "DELETE", None),
        ):
            with self.subTest(path=path, method=method):
                status, body = self.request_json(path, method, payload)
                self.assertEqual(status, 404)
                self.assertIn("error", body)

    def test_invalid_create_payloads_return_400_without_database_write(self):
        invalid_payloads = (
            {"name": "  ", "rating": None, "notes": ""},
            {"name": "Soup", "rating": 6, "notes": ""},
            {"name": "Soup", "rating": True, "notes": ""},
            {"name": "x" * 121, "rating": None, "notes": ""},
            {"name": "Soup", "steps": ["  "]},
            {"name": "Soup", "steps": ["Chop", 7]},
            {"name": "Soup", "ingredients": ["  "]},
            {"name": "Soup", "ingredients": ["Onion", False]},
            {"name": "Soup", "cooking_time_minutes": 0},
            {"name": "Soup", "cooking_time_minutes": 1.5},
            {"name": "Soup", "cooking_temperature_f": -1},
            {"name": "Soup", "cooking_temperature_f": True},
            {"name": "Soup", "servings": 0},
            {"name": "Soup", "servings": 2.5},
            {"name": "Soup", "servings": True},
        )
        for payload in invalid_payloads:
            with self.subTest(payload=payload):
                status, body = self.request_json("/api/recipes", "POST", payload)
                self.assertEqual(status, 400)
                self.assertIn("error", body)

        status, collection = self.request_json("/api/recipes")
        self.assertEqual(status, 200)
        self.assertEqual(collection, [])

    def test_recipe_cooking_details_are_created_updated_removed_and_persisted(self):
        status, created = self.request_json(
            "/api/recipes",
            "POST",
            {
                "name": "Roast chicken",
                "cooking_time_minutes": 90,
                "cooking_temperature_f": 375.5,
                "servings": 4,
            },
        )
        self.assertEqual(status, 201)
        self.assertEqual(created["cooking_time_minutes"], 90)
        self.assertEqual(created["cooking_temperature_f"], 375.5)
        self.assertEqual(created["servings"], 4)
        recipe_path = f"/api/recipes/{created['id']}"

        status, updated = self.request_json(
            recipe_path,
            "PUT",
            {
                "name": "Roast chicken",
                "cooking_time_minutes": 75,
                "cooking_temperature_f": 400,
                "servings": 6,
            },
        )
        self.assertEqual(status, 200)
        self.assertEqual(updated["cooking_time_minutes"], 75)
        self.assertEqual(updated["cooking_temperature_f"], 400)
        self.assertEqual(updated["servings"], 6)
        self.assertEqual(self.request_json("/api/recipes")[1], [updated])

        status, cleared = self.request_json(
            recipe_path,
            "PUT",
            {
                "name": "Roast chicken",
                "cooking_time_minutes": None,
                "cooking_temperature_f": None,
                "servings": None,
            },
        )
        self.assertEqual(status, 200)
        self.assertIsNone(cleared["cooking_time_minutes"])
        self.assertIsNone(cleared["cooking_temperature_f"])
        self.assertIsNone(cleared["servings"])

    def test_recipe_steps_are_created_reordered_removed_and_persisted(self):
        status, created = self.request_json(
            "/api/recipes",
            "POST",
            {"name": "Pasta", "steps": ["Boil water.", "Cook pasta."]},
        )
        self.assertEqual(status, 201)
        self.assertEqual(created["steps"], ["Boil water.", "Cook pasta."])

        recipe_path = f"/api/recipes/{created['id']}"
        status, reordered = self.request_json(
            recipe_path,
            "PUT",
            {"name": "Pasta", "steps": ["Cook pasta.", "Boil water."]},
        )
        self.assertEqual(status, 200)
        self.assertEqual(reordered["steps"], ["Cook pasta.", "Boil water."])
        self.assertEqual(self.request_json("/api/recipes")[1], [reordered])

        status, without_steps = self.request_json(
            recipe_path,
            "PUT",
            {"name": "Pasta", "steps": []},
        )
        self.assertEqual(status, 200)
        self.assertEqual(without_steps["steps"], [])

    def test_recipe_ingredients_are_created_reordered_removed_and_persisted(self):
        status, created = self.request_json(
            "/api/recipes",
            "POST",
            {"name": "Pasta", "ingredients": ["Pasta", "Tomatoes", "Basil"]},
        )
        self.assertEqual(status, 201)
        self.assertEqual(created["ingredients"], ["Pasta", "Tomatoes", "Basil"])

        recipe_path = f"/api/recipes/{created['id']}"
        status, reordered = self.request_json(
            recipe_path,
            "PUT",
            {"name": "Pasta", "ingredients": ["Tomatoes", "Pasta", "Basil"]},
        )
        self.assertEqual(status, 200)
        self.assertEqual(reordered["ingredients"], ["Tomatoes", "Pasta", "Basil"])
        self.assertEqual(self.request_json("/api/recipes")[1], [reordered])

        status, without_ingredients = self.request_json(
            recipe_path,
            "PUT",
            {"name": "Pasta", "ingredients": []},
        )
        self.assertEqual(status, 200)
        self.assertEqual(without_ingredients["ingredients"], [])

    def test_recipe_pictures_upload_in_order_display_and_remove(self):
        _, recipe = self.request_json("/api/recipes", "POST", {"name": "Soup"})
        upload_path = f"/api/recipes/{recipe['id']}/images"
        png_data = b"\x89PNG\r\n\x1a\nimage data"

        status, _, first_body = self.request_bytes(upload_path, "POST", png_data, "image/png")
        self.assertEqual(status, 201)
        first = json.loads(first_body)
        status, _, second_body = self.request_bytes(upload_path, "POST", png_data, "image/png")
        self.assertEqual(status, 201)
        second = json.loads(second_body)

        status, collection = self.request_json("/api/recipes")
        self.assertEqual(status, 200)
        self.assertEqual(collection[0]["images"], [first, second])

        status, headers, body = self.request_bytes(first["url"], "GET", None, "image/png")
        self.assertEqual(status, 200)
        self.assertEqual(headers.get_content_type(), "image/png")
        self.assertEqual(body, png_data)

        status, _, _ = self.request_bytes(first["url"], "DELETE", None, "application/json")
        self.assertEqual(status, 204)
        status, updated = self.request_json(f"/api/recipes/{recipe['id']}")
        self.assertEqual(status, 200)
        self.assertEqual(updated["images"], [second])
        self.assertFalse((self.server.image_directory / f"{first['id']}.png").exists())

        status, _ = self.request_json(f"/api/recipes/{recipe['id']}", "DELETE")
        self.assertEqual(status, 204)
        self.assertFalse((self.server.image_directory / f"{second['id']}.png").exists())

    def test_recipe_picture_upload_validation_and_maximum(self):
        _, recipe = self.request_json("/api/recipes", "POST", {"name": "Soup"})
        upload_path = f"/api/recipes/{recipe['id']}/images"

        status, _, _ = self.request_bytes(upload_path, "POST", b"not an image", "image/png")
        self.assertEqual(status, 400)
        status, _, _ = self.request_bytes(upload_path, "POST", b"\x89PNG\r\n\x1a\n", "image/gif")
        self.assertEqual(status, 400)
        status, _, _ = self.request_bytes(
            upload_path,
            "POST",
            b"\x89PNG\r\n\x1a\n",
            "image/png",
            content_length=5 * 1024 * 1024 + 1,
        )
        self.assertEqual(status, 400)

        for _ in range(10):
            status, _, _ = self.request_bytes(
                upload_path, "POST", b"\x89PNG\r\n\x1a\nimage data", "image/png"
            )
            self.assertEqual(status, 201)
        status, _, body = self.request_bytes(
            upload_path, "POST", b"\x89PNG\r\n\x1a\nimage data", "image/png"
        )
        self.assertEqual(status, 400)
        self.assertIn(b"at most 10", body)

    def test_invalid_update_returns_400_without_changing_resource(self):
        _, created = self.request_json(
            "/api/recipes",
            "POST",
            {"name": "Tomato soup", "rating": 3, "notes": "Original notes."},
        )

        status, body = self.request_json(
            f"/api/recipes/{created['id']}",
            "PUT",
            {"name": " ", "rating": 3, "notes": "Changed notes."},
        )
        self.assertEqual(status, 400)
        self.assertIn("error", body)

        status, unchanged = self.request_json(f"/api/recipes/{created['id']}")
        self.assertEqual(status, 200)
        self.assertEqual(unchanged, created)

    def test_categories_can_be_shared_and_are_removed_when_unused(self):
        _, first = self.request_json(
            "/api/recipes",
            "POST",
            {"name": "Soup", "category": "Dinner"},
        )
        _, second = self.request_json(
            "/api/recipes",
            "POST",
            {"name": "Pasta", "category": "dinner"},
        )
        self.assertEqual(first["category"], "Dinner")
        self.assertEqual(second["category"], "Dinner")

        status, categories = self.request_json("/api/categories")
        self.assertEqual(status, 200)
        self.assertEqual(categories, ["Dinner"])

        status, updated = self.request_json(
            f"/api/recipes/{first['id']}",
            "PUT",
            {"name": "Soup", "category": None},
        )
        self.assertEqual(status, 200)
        self.assertIsNone(updated["category"])
        self.assertEqual(self.request_json("/api/categories")[1], ["Dinner"])

        status, _ = self.request_json(f"/api/recipes/{second['id']}", "DELETE")
        self.assertEqual(status, 204)
        self.assertEqual(self.request_json("/api/categories")[1], [])

        _, recreated = self.request_json(
            "/api/recipes",
            "POST",
            {"name": "New dinner", "category": "Dinner"},
        )
        self.assertEqual(recreated["category"], "Dinner")
        self.assertEqual(self.request_json("/api/categories")[1], ["Dinner"])


if __name__ == "__main__":
    unittest.main()
