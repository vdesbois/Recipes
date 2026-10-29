import unittest

from backend.server import parse_recipe


class RecipeValidationTests(unittest.TestCase):
    def test_trims_fields_and_defaults_optional_values(self):
        self.assertEqual(
            parse_recipe({"name": "  Tomato soup  "}),
            ("Tomato soup", None, "", None, [], [], None, None, None),
        )

    def test_accepts_valid_rating_and_notes(self):
        self.assertEqual(
            parse_recipe({"name": "Soup", "rating": 5, "notes": "  Add basil.  "}),
            ("Soup", 5, "Add basil.", None, [], [], None, None, None),
        )

    def test_trims_category_and_treats_blank_category_as_uncategorized(self):
        self.assertEqual(
            parse_recipe({"name": "Soup", "category": "  Dinner  "}),
            ("Soup", None, "", "Dinner", [], [], None, None, None),
        )
        self.assertEqual(
            parse_recipe({"name": "Soup", "category": "  "}),
            ("Soup", None, "", None, [], [], None, None, None),
        )

    def test_trims_and_preserves_recipe_step_order(self):
        self.assertEqual(
            parse_recipe({"name": "Soup", "steps": ["  Chop vegetables. ", "Simmer."]}),
            ("Soup", None, "", None, ["Chop vegetables.", "Simmer."], [], None, None, None),
        )

    def test_trims_and_preserves_ingredient_order(self):
        self.assertEqual(
            parse_recipe({"name": "Soup", "ingredients": ["  Carrots ", "Onions"]}),
            ("Soup", None, "", None, [], ["Carrots", "Onions"], None, None, None),
        )

    def test_accepts_optional_cooking_details(self):
        self.assertEqual(
            parse_recipe({
                "name": "Soup",
                "cooking_time_minutes": 45,
                "cooking_temperature_f": 350.5,
                "servings": 4,
            }),
            ("Soup", None, "", None, [], [], 45, 350.5, 4),
        )

    def test_rejects_invalid_payloads(self):
        invalid_payloads = (
            [],
            {"name": ""},
            {"name": "Soup", "rating": True},
            {"name": "Soup", "rating": 6},
            {"name": "Soup", "notes": None},
            {"name": "x" * 121},
            {"name": "Soup", "category": 123},
            {"name": "Soup", "category": "x" * 61},
            {"name": "Soup", "steps": None},
            {"name": "Soup", "steps": "Mix and bake."},
            {"name": "Soup", "steps": [""]},
            {"name": "Soup", "steps": ["   "]},
            {"name": "Soup", "steps": ["Mix", 2]},
            {"name": "Soup", "ingredients": None},
            {"name": "Soup", "ingredients": "Carrots and onions"},
            {"name": "Soup", "ingredients": [""]},
            {"name": "Soup", "ingredients": ["  "]},
            {"name": "Soup", "ingredients": ["Carrots", 2]},
            {"name": "Soup", "cooking_time_minutes": 0},
            {"name": "Soup", "cooking_time_minutes": 1.5},
            {"name": "Soup", "cooking_time_minutes": True},
            {"name": "Soup", "cooking_temperature_f": -1},
            {"name": "Soup", "cooking_temperature_f": float("inf")},
            {"name": "Soup", "cooking_temperature_f": True},
            {"name": "Soup", "servings": 0},
            {"name": "Soup", "servings": 2.5},
            {"name": "Soup", "servings": True},
        )
        for payload in invalid_payloads:
            with self.subTest(payload=payload):
                with self.assertRaises(ValueError):
                    parse_recipe(payload)


if __name__ == "__main__":
    unittest.main()
