import sqlite3
import uuid
from contextlib import closing
from pathlib import Path


SCHEMA_PATH = Path(__file__).with_name("schema.sql")
MAX_RECIPE_IMAGES = 10


class RecipeNotFoundError(Exception):
    pass


class RecipeImageLimitError(Exception):
    pass


def _connect(database_path):
    connection = sqlite3.connect(database_path, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("pragma foreign_keys = on")
    return connection


def initialize_database(database_path):
    database_path = Path(database_path)
    database_path.parent.mkdir(parents=True, exist_ok=True)
    schema = SCHEMA_PATH.read_text(encoding="utf-8")
    with closing(_connect(database_path)) as connection, connection:
        connection.executescript(schema)
        columns = {
            row["name"] for row in connection.execute("pragma table_info(recipes)")
        }
        if "category_id" not in columns:
            connection.execute(
                "alter table recipes add column category_id integer "
                "references categories (id) on delete set null"
            )
        connection.execute(
            "create index if not exists recipes_category_id_idx on recipes (category_id)"
        )


def list_recipes(database_path):
    with closing(_connect(database_path)) as connection:
        rows = connection.execute(
            """
            select recipes.id, recipes.name, recipes.rating, recipes.notes,
                   categories.name as category
            from recipes
            left join categories on categories.id = recipes.category_id
            order by recipes.created_at desc, recipes.rowid desc
            """
        ).fetchall()
        recipes = {
            row["id"]: {
                "id": row["id"],
                "name": row["name"],
                "rating": row["rating"],
                "notes": row["notes"],
                "category": row["category"],
                "steps": [],
                "ingredients": [],
                "images": [],
            }
            for row in rows
        }
        _populate_ordered_items(connection, recipes, "steps")
        _populate_ordered_items(connection, recipes, "ingredients")
        _populate_recipe_images(connection, recipes)
    return list(recipes.values())


def _read_recipe(connection, recipe_id):
    row = connection.execute(
        """
        select recipes.id, recipes.name, recipes.rating, recipes.notes,
               categories.name as category
        from recipes
        left join categories on categories.id = recipes.category_id
        where recipes.id = ?
        """,
        (recipe_id,),
    ).fetchone()
    if row is None:
        return None

    recipe = {
        "id": row["id"],
        "name": row["name"],
        "rating": row["rating"],
        "notes": row["notes"],
        "category": row["category"],
        "steps": [],
        "ingredients": [],
        "images": [],
    }
    _populate_ordered_items(connection, {recipe_id: recipe}, "steps", recipe_id)
    _populate_ordered_items(connection, {recipe_id: recipe}, "ingredients", recipe_id)
    _populate_recipe_images(connection, {recipe_id: recipe}, recipe_id)
    return recipe


def _populate_recipe_images(connection, recipes, recipe_id=None):
    if recipe_id is None:
        rows = connection.execute(
            "select id, recipe_id, position from recipe_images "
            "order by recipe_id, position"
        ).fetchall()
    else:
        rows = connection.execute(
            "select id, recipe_id, position from recipe_images "
            "where recipe_id = ? order by position",
            (recipe_id,),
        ).fetchall()
    for row in rows:
        recipe = recipes.get(row["recipe_id"])
        if recipe is not None:
            recipe["images"].append({
                "id": row["id"],
                "url": f"/api/recipes/{row['recipe_id']}/images/{row['id']}",
            })


def _populate_ordered_items(connection, recipes, collection, recipe_id=None):
    table = "recipe_steps" if collection == "steps" else "recipe_ingredients"
    if recipe_id is None:
        rows = connection.execute(
            f"select recipe_id, content from {table} order by recipe_id, position"
        ).fetchall()
    else:
        rows = connection.execute(
            f"select recipe_id, content from {table} "
            "where recipe_id = ? order by position",
            (recipe_id,),
        ).fetchall()
    for row in rows:
        recipe = recipes.get(row["recipe_id"])
        if recipe is not None:
            recipe[collection].append(row["content"])


def read_recipe(database_path, recipe_id):
    with closing(_connect(database_path)) as connection:
        return _read_recipe(connection, recipe_id)


def add_recipe_image(database_path, recipe_id, image_id, file_name, content_type):
    with closing(_connect(database_path)) as connection:
        connection.execute("begin immediate")
        recipe = connection.execute(
            "select 1 from recipes where id = ?", (recipe_id,)
        ).fetchone()
        if recipe is None:
            raise RecipeNotFoundError

        image_count = connection.execute(
            "select count(*) from recipe_images where recipe_id = ?", (recipe_id,)
        ).fetchone()[0]
        if image_count >= MAX_RECIPE_IMAGES:
            raise RecipeImageLimitError

        connection.execute(
            """
            insert into recipe_images (id, recipe_id, position, file_name, content_type)
            values (?, ?, ?, ?, ?)
            """,
            (image_id, recipe_id, image_count, file_name, content_type),
        )
        connection.commit()
    return {
        "id": image_id,
        "url": f"/api/recipes/{recipe_id}/images/{image_id}",
    }


def get_recipe_image(database_path, recipe_id, image_id):
    with closing(_connect(database_path)) as connection:
        row = connection.execute(
            """
            select file_name, content_type from recipe_images
            where recipe_id = ? and id = ?
            """,
            (recipe_id, image_id),
        ).fetchone()
    return dict(row) if row is not None else None


def list_recipe_images(database_path, recipe_id):
    with closing(_connect(database_path)) as connection:
        rows = connection.execute(
            "select id, file_name from recipe_images where recipe_id = ? order by position",
            (recipe_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def delete_recipe_image(database_path, recipe_id, image_id):
    with closing(_connect(database_path)) as connection, connection:
        row = connection.execute(
            "select file_name from recipe_images where recipe_id = ? and id = ?",
            (recipe_id, image_id),
        ).fetchone()
        if row is None:
            return None

        connection.execute(
            "delete from recipe_images where recipe_id = ? and id = ?",
            (recipe_id, image_id),
        )
        remaining_images = connection.execute(
            "select id from recipe_images where recipe_id = ? order by position",
            (recipe_id,),
        ).fetchall()
        connection.executemany(
            "update recipe_images set position = ? where id = ?",
            ((position, image["id"]) for position, image in enumerate(remaining_images)),
        )
    return row["file_name"]


def list_categories(database_path):
    with closing(_connect(database_path)) as connection:
        rows = connection.execute(
            """
            select categories.name
            from categories
            join recipes on recipes.category_id = categories.id
            group by categories.id
            order by categories.name collate nocase
            """
        ).fetchall()
    return [row["name"] for row in rows]


def _category_id(connection, category):
    if category is None:
        return None

    connection.execute(
        "insert into categories (name) values (?) on conflict(name) do nothing",
        (category,),
    )
    row = connection.execute(
        "select id from categories where name = ? collate nocase",
        (category,),
    ).fetchone()
    return row["id"]


def _remove_unused_category(connection, category_id):
    if category_id is not None:
        connection.execute(
            """
            delete from categories
            where id = ? and not exists (
                select 1 from recipes where recipes.category_id = categories.id
            )
            """,
            (category_id,),
        )


def create_recipe(
    database_path, name, rating, notes, category=None, steps=None, ingredients=None
):
    recipe_id = str(uuid.uuid4())
    with closing(_connect(database_path)) as connection, connection:
        category_id = _category_id(connection, category)
        connection.execute(
            "insert into recipes (id, name, rating, notes, category_id) values (?, ?, ?, ?, ?)",
            (recipe_id, name, rating, notes, category_id),
        )
        _replace_steps(connection, recipe_id, steps or [])
        _replace_ingredients(connection, recipe_id, ingredients or [])
        recipe = _read_recipe(connection, recipe_id)
    return recipe


def update_recipe(
    database_path, recipe_id, name, rating, notes, category=None, steps=None, ingredients=None
):
    with closing(_connect(database_path)) as connection, connection:
        existing = connection.execute(
            "select category_id from recipes where id = ?",
            (recipe_id,),
        ).fetchone()
        if existing is None:
            return None

        old_category_id = existing["category_id"]
        category_id = _category_id(connection, category)
        cursor = connection.execute(
            "update recipes set name = ?, rating = ?, notes = ?, category_id = ? where id = ?",
            (name, rating, notes, category_id, recipe_id),
        )
        if cursor.rowcount == 0:
            return None
        _replace_steps(connection, recipe_id, steps or [])
        _replace_ingredients(connection, recipe_id, ingredients or [])
        _remove_unused_category(connection, old_category_id)
        recipe = _read_recipe(connection, recipe_id)
    return recipe


def _replace_steps(connection, recipe_id, steps):
    connection.execute("delete from recipe_steps where recipe_id = ?", (recipe_id,))
    connection.executemany(
        "insert into recipe_steps (recipe_id, position, content) values (?, ?, ?)",
        ((recipe_id, position, step) for position, step in enumerate(steps)),
    )


def _replace_ingredients(connection, recipe_id, ingredients):
    connection.execute(
        "delete from recipe_ingredients where recipe_id = ?", (recipe_id,)
    )
    connection.executemany(
        "insert into recipe_ingredients (recipe_id, position, content) values (?, ?, ?)",
        ((recipe_id, position, ingredient) for position, ingredient in enumerate(ingredients)),
    )


def delete_recipe(database_path, recipe_id):
    with closing(_connect(database_path)) as connection, connection:
        existing = connection.execute(
            "select category_id from recipes where id = ?",
            (recipe_id,),
        ).fetchone()
        if existing is None:
            return False
        category_id = existing["category_id"]
        cursor = connection.execute("delete from recipes where id = ?", (recipe_id,))
        if cursor.rowcount == 0:
            return False
        _remove_unused_category(connection, category_id)
        return True
