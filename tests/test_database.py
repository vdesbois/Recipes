import sqlite3
import tempfile
import unittest
from pathlib import Path

from database.repository import (
    create_recipe,
    delete_recipe,
    initialize_database,
    list_categories,
    list_recipes,
    read_recipe,
    update_recipe,
)


class RecipeDatabaseTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.database_path = Path(self.temp_dir.name) / "recipes.sqlite3"
        initialize_database(self.database_path)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_create_and_list_recipe_with_empty_optional_fields(self):
        recipe = create_recipe(self.database_path, "Tomato soup", None, "")

        self.assertEqual(recipe["steps"], [])
        self.assertEqual(recipe["ingredients"], [])
        self.assertIsNone(recipe["cooking_time_minutes"])
        self.assertIsNone(recipe["cooking_temperature_f"])
        self.assertIsNone(recipe["servings"])
        self.assertEqual(list_recipes(self.database_path), [recipe])

    def test_cooking_details_are_created_updated_and_removed(self):
        recipe = create_recipe(
            self.database_path,
            "Roast chicken",
            None,
            "",
            cooking_time_minutes=90,
            cooking_temperature_f=375.5,
            servings=4,
        )
        self.assertEqual(recipe["cooking_time_minutes"], 90)
        self.assertEqual(recipe["cooking_temperature_f"], 375.5)
        self.assertEqual(recipe["servings"], 4)
        self.assertEqual(read_recipe(self.database_path, recipe["id"]), recipe)

        updated = update_recipe(
            self.database_path,
            recipe["id"],
            "Roast chicken",
            None,
            "",
            cooking_time_minutes=75,
            cooking_temperature_f=400,
            servings=6,
        )
        self.assertEqual(updated["cooking_time_minutes"], 75)
        self.assertEqual(updated["cooking_temperature_f"], 400)
        self.assertEqual(updated["servings"], 6)
        self.assertEqual(list_recipes(self.database_path), [updated])

        without_details = update_recipe(
            self.database_path, recipe["id"], "Roast chicken", None, ""
        )
        self.assertIsNone(without_details["cooking_time_minutes"])
        self.assertIsNone(without_details["cooking_temperature_f"])
        self.assertIsNone(without_details["servings"])

    def test_update_recipe(self):
        recipe = create_recipe(self.database_path, "Tomato soup", None, "")

        updated = update_recipe(
            self.database_path,
            recipe["id"],
            "Roasted tomato soup",
            5,
            "Add basil.",
            steps=["Chop the basil.", "Stir it in."],
            ingredients=["Tomatoes", "Fresh basil"],
        )

        self.assertEqual(updated["name"], "Roasted tomato soup")
        self.assertEqual(updated["rating"], 5)
        self.assertEqual(updated["notes"], "Add basil.")
        self.assertEqual(updated["steps"], ["Chop the basil.", "Stir it in."])
        self.assertEqual(updated["ingredients"], ["Tomatoes", "Fresh basil"])
        self.assertEqual(list_recipes(self.database_path), [updated])

        reordered = update_recipe(
            self.database_path,
            recipe["id"],
            "Roasted tomato soup",
            5,
            "Add basil.",
            steps=["Stir it in.", "Chop the basil."],
            ingredients=["Fresh basil", "Tomatoes"],
        )
        self.assertEqual(reordered["steps"], ["Stir it in.", "Chop the basil."])
        self.assertEqual(reordered["ingredients"], ["Fresh basil", "Tomatoes"])

        without_steps = update_recipe(
            self.database_path,
            recipe["id"],
            "Roasted tomato soup",
            5,
            "Add basil.",
        )
        self.assertEqual(without_steps["steps"], [])
        self.assertEqual(without_steps["ingredients"], [])

    def test_update_missing_recipe_returns_none(self):
        result = update_recipe(
            self.database_path,
            "missing-id",
            "Soup",
            None,
            "",
        )

        self.assertIsNone(result)

    def test_categories_are_shared_and_removed_when_no_recipe_uses_them(self):
        first = create_recipe(self.database_path, "Soup", None, "", "Dinner")
        second = create_recipe(self.database_path, "Pasta", None, "", "dinner")

        self.assertEqual(first["category"], "Dinner")
        self.assertEqual(second["category"], "Dinner")
        self.assertEqual(list_categories(self.database_path), ["Dinner"])
        self.assertEqual(read_recipe(self.database_path, first["id"])["category"], "Dinner")

        updated = update_recipe(self.database_path, first["id"], "Soup", None, "", None)
        self.assertIsNone(updated["category"])
        self.assertEqual(list_categories(self.database_path), ["Dinner"])

        self.assertTrue(delete_recipe(self.database_path, second["id"]))
        self.assertEqual(list_categories(self.database_path), [])
        self.assertFalse(delete_recipe(self.database_path, second["id"]))

    def test_uncategorizing_last_recipe_removes_category(self):
        recipe = create_recipe(self.database_path, "Soup", None, "", "Lunch")

        update_recipe(self.database_path, recipe["id"], "Soup", None, "", None)

        self.assertEqual(list_categories(self.database_path), [])

    def test_initialize_migrates_existing_recipe_database(self):
        legacy_path = Path(self.temp_dir.name) / "legacy.sqlite3"
        with sqlite3.connect(legacy_path) as connection:
            connection.execute(
                """
                create table recipes (
                    id text primary key,
                    name text not null,
                    rating integer,
                    notes text not null default '',
                    created_at text not null default current_timestamp
                )
                """
            )
            connection.execute(
                "insert into recipes (id, name, rating, notes) values (?, ?, ?, ?)",
                ("legacy-recipe", "Legacy soup", None, ""),
            )

        initialize_database(legacy_path)

        migrated = read_recipe(legacy_path, "legacy-recipe")
        self.assertEqual(migrated["name"], "Legacy soup")
        self.assertIsNone(migrated["category"])
        self.assertEqual(migrated["steps"], [])
        self.assertEqual(migrated["ingredients"], [])
        self.assertIsNone(migrated["cooking_time_minutes"])
        self.assertIsNone(migrated["cooking_temperature_f"])
        self.assertIsNone(migrated["servings"])

    def test_database_constraints_reject_invalid_recipes(self):
        invalid_values = (
            ("", None, ""),
            ("Valid name", 0, ""),
            ("Valid name", 6, ""),
        )
        for name, rating, notes in invalid_values:
            with self.subTest(name=name, rating=rating):
                with self.assertRaises(sqlite3.IntegrityError):
                    create_recipe(self.database_path, name, rating, notes)


if __name__ == "__main__":
    unittest.main()
