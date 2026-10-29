import json
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from backend.server import create_server
from database.repository import list_recipes


class RecipeAppIntegrationTests(unittest.TestCase):
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
        with urlopen(request) as response:
            return response.status, json.loads(response.read())

    def test_frontend_assets_are_served(self):
        for path, expected in (
            ("/", b"Add ingredient"),
            ("/recipe.html", b"detail-name"),
            ("/recipe-page.js", b"getRecipe"),
            ("/app.js", b"recipe-collection.js"),
            ("/api.js", b"uploadRecipeImage"),
            ("/recipe-collection.js", b"createRecipeCard"),
            ("/recipe-form.js", b"createOrderedListEditor"),
            ("/ordered-list-editor.js", b"Move"),
            ("/recipe-card.js", b"recipe-card-link"),
            ("/styles.css", b".recipe-card"),
        ):
            with self.subTest(path=path):
                with urlopen(self.base_url + path) as response:
                    self.assertEqual(response.status, 200)
                    self.assertIn(expected, response.read())

    def test_http_create_update_and_database_persistence(self):
        status, created = self.request_json(
            "/api/recipes",
            "POST",
            {"name": "  Tomato soup  ", "rating": None, "notes": "", "ingredients": ["Tomatoes"]},
        )
        self.assertEqual(status, 201)
        self.assertEqual(created["name"], "Tomato soup")
        self.assertIsNone(created["rating"])
        self.assertEqual(created["ingredients"], ["Tomatoes"])

        persisted = list_recipes(self.database_path)
        self.assertEqual(persisted, [created])

        status, updated = self.request_json(
            f"/api/recipes/{created['id']}",
            "PUT",
            {
                "name": "Roasted tomato soup",
                "rating": 4,
                "notes": "Add basil.",
                "ingredients": ["Basil"],
            },
        )
        self.assertEqual(status, 200)
        self.assertEqual(updated["name"], "Roasted tomato soup")
        self.assertEqual(updated["ingredients"], ["Basil"])
        self.assertEqual(list_recipes(self.database_path), [updated])

        status, listed = self.request_json("/api/recipes")
        self.assertEqual(status, 200)
        self.assertEqual(listed, [updated])

    def test_invalid_recipe_is_rejected_without_database_write(self):
        with self.assertRaises(HTTPError) as error:
            self.request_json(
                "/api/recipes",
                "POST",
                {"name": " ", "rating": 7, "notes": ""},
            )
        self.assertEqual(error.exception.code, 400)
        error.exception.close()
        self.assertEqual(list_recipes(self.database_path), [])

    def test_missing_recipe_update_returns_not_found(self):
        with self.assertRaises(HTTPError) as error:
            self.request_json(
                "/api/recipes/00000000-0000-0000-0000-000000000000",
                "PUT",
                {"name": "Soup", "rating": None, "notes": ""},
            )
        self.assertEqual(error.exception.code, 404)
        error.exception.close()


if __name__ == "__main__":
    unittest.main()
