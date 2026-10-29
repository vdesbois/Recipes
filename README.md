# mise

A personal recipe box served from your computer and backed by a local SQLite database. Devices on the same home network can use the same collection by opening the server computer's local IP address.

## Project structure

- `frontend/` contains the browser app: `app.js` coordinates the collection page, `recipe-page.js` renders an individual recipe, `api.js` handles REST calls, `recipe-form.js` manages recipe editing, `ordered-list-editor.js` provides reusable ingredient/step editing, `recipe-collection.js` handles filtering and collection display, and `recipe-card.js` renders each recipe.
- `backend/` contains the Python HTTP server, API routes, and request validation.
- `database/` contains the SQLite schema and database repository.
- `tests/` contains backend validation, database, HTTP/database integration, and Playwright browser tests.
- `data/recipes.sqlite3` is created at runtime to hold recipes and is excluded from Git.

## Run the app

1. Install Python 3 if it is not already available.
2. From this folder, run `python3 -m backend.server`.
3. On the computer running the server, open `http://localhost:8000`.
4. On another device connected to the same home network, open `http://<server-computer-local-IP>:8000`. Find the local IP in that computer's network settings (on Linux, `hostname -I` can help).

Keep the server process running while using the app. SQLite data is stored in `data/recipes.sqlite3` and uploaded pictures are stored in `data/recipe-images/` on the server computer. Back up both to preserve your collection.

To select a different database path or server port, use `python3 -m backend.server --help`.

## Run with Docker on Ubuntu

Install Docker Engine and the Docker Compose plugin on the server, then clone this repository. From the project directory, create the persistent data directory and let the container's unprivileged user write to it:

```sh
sudo mkdir -p data
sudo chown -R 10001:10001 data
docker compose up -d --build
```

Open `http://<server-computer-local-IP>:8000` from a device on your home network. Compose publishes the app on port 8000 and restarts it automatically after a reboot. Recipe data is stored in the host's `data/` directory, mounted into the container; this includes both `recipes.sqlite3` and the `recipe-images/` directory. The Docker image runs the app as an unprivileged user.

To update after a new version is pushed:

```sh
git pull
docker compose up -d --build
```

Back up the database and pictures together. To make a consistent archive, stop the app while archiving, then start it again:

```sh
docker compose stop
tar -czf "$HOME/recipe-data-$(date +%F).tar.gz" data
docker compose start
```

Restore the archive into `data/` while the app is stopped, then make sure the directory is writable by the container user with `sudo chown -R 10001:10001 data`.

## Run tests

Run the backend, database, and integration tests from the project root:

```sh
python3 -m unittest discover -s tests -v
```

REST API tests in `tests/test_rest_api.py` exercise the collection and individual-recipe resources through HTTP: `GET`, `POST`, `PUT`, and `DELETE`, including status codes, validation errors, missing resources, category reuse, ordered recipe steps and ingredients, and database persistence. The API follows `/api/recipes` for the collection, `/api/recipes/{id}` for an individual recipe, and `GET /api/categories` for currently assigned category suggestions. Create or reuse a category by supplying its name as the recipe `category` in a `POST` or `PUT`; send `null` or an empty string to leave the recipe uncategorized. Category names are shared case-insensitively and are removed from suggestions once no recipe uses them. `tests/test_integration.py` verifies frontend assets are served; all Python tests use temporary databases and do not modify your recipe collection.

### Playwright browser tests

Install Node.js and npm, install the JavaScript test dependencies, and install the Chromium browser once:

```sh
npm install
npx playwright install chromium
```

Run the browser tests with:

```sh
npm run test:e2e
```

The Playwright configuration starts the app on localhost with a dedicated database at `test-results/playwright.sqlite3`, resetting it at the start of each run. This generated test data is ignored by Git and never uses or changes `data/recipes.sqlite3`. The tests cover the initial empty state, required names, empty rating/notes/category/cooking-detail defaults, creating, editing, deleting, opening recipe details from collection cards, adding/removing/reordering numbered recipe steps and bulleted ingredients, adding/editing/removing cooking time, Fahrenheit cooking temperature, and servings, uploading and removing recipe pictures, displaying the first picture, searching titles and notes by case-insensitive contiguous text, filtering by one category or uncategorized recipes, category reuse and suggestion cleanup, persistence after reload, and save-error handling.

## Network and privacy

The server listens on all network interfaces so other home devices can connect. As requested, it has no password: anyone who can reach it on your network can view and edit recipes. Use it only on a trusted private network; do not expose port 8000 to the public internet. If the computer's firewall blocks connections, allow port 8000 only on your private/home network.

## Data model

Each recipe has a required name, an optional integer rating from 1 to 5, notes that default to an empty string, optional cooking time in whole minutes, optional cooking temperature in degrees Fahrenheit, optional positive whole-number servings, ordered lists of zero or more ingredients and steps, up to 10 JPEG, PNG, or WebP pictures (5 MB each), and at most one optional category. The collection cards show the title, rating, notes, and first picture when available; opening a card shows the full recipe details. Pictures are stored under `data/recipe-images/`; all pictures can be removed in the editor. Back up this directory along with the SQLite database. Ingredients can be added, edited, removed, and reordered in the recipe form; they display as a bulleted list. Steps can be added, edited, removed, and reordered in the recipe form; they display as a numbered list. Categories can be reused across recipes; a category is retained only while at least one recipe is assigned to it. The collection can be filtered to one category at a time (or uncategorized recipes) and searched for a case-insensitive contiguous text match in recipe titles or notes. Existing recipe databases are migrated automatically to add the optional category relationship, cooking details, recipe steps, ingredients, and pictures without removing existing recipes.
