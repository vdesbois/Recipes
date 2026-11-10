package ca.mise.recipes;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.TextWatcher;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.ArrayAdapter;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.Collator;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    private static final int PICK_IMAGES = 41;
    private static final int MAX_IMAGE_BYTES = 5 * 1024 * 1024;
    private static final int MAX_IMAGES = 10;
    private static final int INK = Color.rgb(38, 59, 50);
    private static final int MUTED = Color.rgb(120, 131, 123);
    private static final int GREEN = Color.rgb(53, 90, 70);
    private static final int PAPER = Color.rgb(246, 245, 240);
    private static final int CARD = Color.rgb(255, 254, 250);
    private static final int GOLD = Color.rgb(197, 140, 57);

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final ExecutorService executor = Executors.newCachedThreadPool();
    private final List<JSONObject> recipes = new ArrayList<>();
    private final List<String> categories = new ArrayList<>();
    private final List<Uri> pendingImages = new ArrayList<>();
    private SharedPreferences preferences;
    private LinearLayout page;
    private LinearLayout content;
    private String serverUrl = "";
    private String selectedCategory = "";
    private String searchText = "";
    private JSONObject selectedRecipe;
    private JSONObject formRecipe;
    private TextView pictureCountLabel;
    private boolean showingDetails;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(PAPER);
        getWindow().setNavigationBarColor(PAPER);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        preferences = getSharedPreferences("mise", MODE_PRIVATE);
        serverUrl = preferences.getString("server_url", "");
        buildPage();
        if (serverUrl.isEmpty()) {
            renderHome(null);
        } else {
            loadCollection();
        }
    }

    private void buildPage() {
        page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setBackgroundColor(PAPER);

        LinearLayout toolbar = new LinearLayout(this);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.setPadding(dp(20), dp(12), dp(16), dp(12));
        toolbar.setBackgroundColor(PAPER);
        TextView brand = text("✳  mise", 23, INK);
        brand.setTypeface(Typeface.SERIF, Typeface.BOLD);
        toolbar.addView(brand, new LinearLayout.LayoutParams(0, -2, 1));
        TextView tagline = text("YOUR PERSONAL RECIPE BOX", 10, MUTED);
        tagline.setTypeface(null, Typeface.BOLD);
        toolbar.addView(tagline);
        Button settings = quietButton("⚙");
        settings.setContentDescription("Server settings");
        settings.setOnClickListener(view -> showServerSettings());
        toolbar.addView(settings);
        page.addView(toolbar);

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(20), dp(18), dp(20), dp(28));
        scroll.addView(content);
        page.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(page);
    }

    private void renderHome(String error) {
        showingDetails = false;
        cardRenderer = null;
        content.removeAllViews();
        TextView eyebrow = text("A LITTLE INSPIRATION, CLOSE AT HAND", 11, GREEN);
        eyebrow.setTypeface(null, Typeface.BOLD);
        addGap(content, 8);
        content.addView(eyebrow);
        TextView title = text("Recipes worth\ncoming back to.", 34, INK);
        title.setTypeface(Typeface.SERIF, Typeface.BOLD);
        content.addView(title);
        TextView intro = text("Keep your favorites, little notes, and kitchen memories all in one place.", 15, MUTED);
        intro.setPadding(0, dp(10), 0, dp(22));
        content.addView(intro);

        LinearLayout panel = card();
        panel.setPadding(dp(18), dp(18), dp(18), dp(18));
        content.addView(panel, matchWrap());
        TextView heading = text(serverUrl.isEmpty() ? "Connect your recipe box"
                : error != null && error.startsWith("Connecting") ? "Connecting to your recipe box"
                : "Server unavailable", 20, INK);
        heading.setTypeface(Typeface.SERIF, Typeface.BOLD);
        panel.addView(heading);
        TextView description = text(
                serverUrl.isEmpty()
                        ? "Set the address of your mise server to view and manage your recipes. You can change it at any time."
                        : "The app is still ready to use. Check your server address or network, then try again.",
                14, MUTED);
        description.setPadding(0, dp(10), 0, dp(14));
        panel.addView(description);
        if (!serverUrl.isEmpty()) {
            TextView address = text(serverUrl, 13, INK);
            panel.addView(address);
        }
        if (error != null && !error.isEmpty()) {
            TextView errorText = text(error, 14, Color.rgb(157, 56, 44));
            errorText.setPadding(0, dp(12), 0, 0);
            panel.addView(errorText);
        }
        Button configure = primaryButton(serverUrl.isEmpty() ? "Set server address" : "Change server address");
        configure.setOnClickListener(view -> showServerSettings());
        LinearLayout.LayoutParams configureParams = matchWrap();
        configureParams.topMargin = dp(18);
        panel.addView(configure, configureParams);
        if (!serverUrl.isEmpty()) {
            Button retry = quietButton("Try again");
            retry.setOnClickListener(view -> loadCollection());
            LinearLayout.LayoutParams retryParams = matchWrap();
            retryParams.topMargin = dp(8);
            panel.addView(retry, retryParams);
        }
        TextView footer = text("Made for the recipes that feel like home  ♥", 12, MUTED);
        footer.setGravity(Gravity.CENTER);
        footer.setPadding(0, dp(32), 0, dp(12));
        content.addView(footer);
    }

    private void renderCollection() {
        showingDetails = false;
        content.removeAllViews();
        TextView eyebrow = text("THE COLLECTION", 10, MUTED);
        eyebrow.setTypeface(null, Typeface.BOLD);
        content.addView(eyebrow);
        TextView title = text("Your recipes  " + visibleRecipes().size(), 27, INK);
        title.setTypeface(Typeface.SERIF, Typeface.BOLD);
        title.setPadding(0, dp(4), 0, dp(14));
        content.addView(title);

        Button add = primaryButton("＋  Add a recipe");
        add.setOnClickListener(view -> showRecipeForm(null));
        content.addView(add, matchWrap());

        TextView searchLabel = fieldLabel("Search recipes");
        searchLabel.setPadding(0, dp(18), 0, dp(5));
        content.addView(searchLabel);
        EditText search = editText("Search titles, notes, and ingredients", false);
        search.setSingleLine(true);
        search.setText(searchText);
        content.addView(search, matchWrap());
        search.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence value, int start, int count, int after) {}
            @Override public void onTextChanged(CharSequence value, int start, int before, int count) {
                searchText = value.toString().trim();
                renderRecipeCards();
            }
            @Override public void afterTextChanged(Editable value) {}
        });

        TextView categoryLabel = fieldLabel("Show category");
        categoryLabel.setPadding(0, dp(14), 0, dp(5));
        content.addView(categoryLabel);
        List<String> filterOptions = new ArrayList<>();
        filterOptions.add("All recipes");
        filterOptions.add("Uncategorized");
        filterOptions.addAll(categories);
        Spinner categorySpinner = new Spinner(this);
        categorySpinner.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, filterOptions));
        int selectedPosition = 0;
        if ("uncategorized".equals(selectedCategory)) selectedPosition = 1;
        else if (selectedCategory.startsWith("category:")) {
            selectedPosition = Math.max(0, filterOptions.indexOf(selectedCategory.substring(9)));
        }
        categorySpinner.setSelection(selectedPosition);
        content.addView(categorySpinner, matchWrap());
        categorySpinner.setOnItemSelectedListener(new android.widget.AdapterView.OnItemSelectedListener() {
            @Override public void onItemSelected(android.widget.AdapterView<?> parent, View view, int position, long id) {
                selectedCategory = position == 1 ? "uncategorized"
                        : position >= 2 ? "category:" + categories.get(position - 2) : "";
                renderRecipeCards();
            }
            @Override public void onNothingSelected(android.widget.AdapterView<?> parent) {}
        });

        TextView count = text("", 12, MUTED);
        count.setPadding(0, dp(14), 0, dp(4));
        content.addView(count);
        LinearLayout list = new LinearLayout(this);
        list.setOrientation(LinearLayout.VERTICAL);
        content.addView(list, matchWrap());
        Runnable renderCards = () -> {
            List<JSONObject> visible = visibleRecipes();
            count.setText(visible.size() + (visible.size() == 1 ? " recipe" : " recipes"));
            list.removeAllViews();
            if (visible.isEmpty()) {
                LinearLayout empty = card();
                empty.setPadding(dp(18), dp(18), dp(18), dp(18));
                TextView emptyTitle = text(recipes.isEmpty() ? "Your recipe box is ready" : "No recipes found", 18, INK);
                emptyTitle.setTypeface(Typeface.SERIF, Typeface.BOLD);
                empty.addView(emptyTitle);
                TextView emptyCopy = text(recipes.isEmpty()
                        ? "Add a favorite recipe and it will appear here."
                        : "Try another search or category.", 14, MUTED);
                emptyCopy.setPadding(0, dp(8), 0, 0);
                empty.addView(emptyCopy);
                list.addView(empty, cardParams());
                return;
            }
            for (JSONObject recipe : visible) {
                list.addView(recipeCard(recipe), cardParams());
            }
        };
        cardRenderer = renderCards;
        renderCards.run();
    }

    private Runnable cardRenderer;

    private void renderRecipeCards() {
        if (cardRenderer != null) cardRenderer.run();
    }

    private List<JSONObject> visibleRecipes() {
        List<JSONObject> visible = new ArrayList<>();
        String query = searchText.toLowerCase(Locale.ROOT);
        for (JSONObject recipe : recipes) {
            String name = recipe.optString("name", "");
            String notes = recipe.optString("notes", "");
            JSONArray ingredients = recipe.optJSONArray("ingredients");
            boolean ingredientMatches = false;
            if (ingredients != null) {
                for (int index = 0; index < ingredients.length(); index++) {
                    if (ingredients.optString(index, "").toLowerCase(Locale.ROOT).contains(query)) {
                        ingredientMatches = true;
                        break;
                    }
                }
            }
            Object category = recipe.opt("category");
            boolean categoryMatches = selectedCategory.isEmpty()
                    || ("uncategorized".equals(selectedCategory) && (category == null || category == JSONObject.NULL))
                    || (selectedCategory.startsWith("category:")
                    && selectedCategory.substring(9).equals(String.valueOf(category)));
            if (categoryMatches && (query.isEmpty()
                    || name.toLowerCase(Locale.ROOT).contains(query)
                    || notes.toLowerCase(Locale.ROOT).contains(query)
                    || ingredientMatches)) {
                visible.add(recipe);
            }
        }
        Collator collator = Collator.getInstance();
        collator.setStrength(Collator.PRIMARY);
        Collections.sort(visible, (first, second) -> collator.compare(
                first.optString("name", ""), second.optString("name", "")));
        return visible;
    }

    private View recipeCard(JSONObject recipe) {
        LinearLayout card = card();
        card.setPadding(dp(16), dp(14), dp(16), dp(14));
        LinearLayout heading = new LinearLayout(this);
        heading.setGravity(Gravity.CENTER_VERTICAL);
        TextView name = text(recipe.optString("name", ""), 19, INK);
        name.setTypeface(Typeface.SERIF, Typeface.BOLD);
        heading.addView(name, new LinearLayout.LayoutParams(0, -2, 1));
        Button viewButton = quietButton("View");
        viewButton.setOnClickListener(view -> showDetails(recipe));
        heading.addView(viewButton);
        card.addView(heading);

        JSONArray images = recipe.optJSONArray("images");
        if (images != null && images.length() > 0) {
            JSONObject image = images.optJSONObject(0);
            if (image != null) {
                ImageView preview = new ImageView(this);
                preview.setScaleType(ImageView.ScaleType.CENTER_CROP);
                card.addView(preview, new LinearLayout.LayoutParams(-1, dp(170)));
                loadImage(image.optString("url", ""), preview);
            }
        }
        int rating = recipe.optInt("rating", 0);
        TextView stars = text(rating == 0 ? "Not rated" : stars(rating), 14, rating == 0 ? MUTED : GOLD);
        stars.setPadding(0, dp(8), 0, dp(2));
        card.addView(stars);
        String category = recipe.optString("category", "");
        if (!category.isEmpty()) {
            TextView categoryText = text(category.toUpperCase(Locale.ROOT), 10, GREEN);
            categoryText.setTypeface(null, Typeface.BOLD);
            categoryText.setPadding(0, dp(4), 0, 0);
            card.addView(categoryText);
        }
        String notes = recipe.optString("notes", "");
        if (!notes.isEmpty()) {
            TextView noteText = text(notes, 14, MUTED);
            noteText.setMaxLines(4);
            noteText.setPadding(0, dp(6), 0, 0);
            card.addView(noteText);
        }
        return card;
    }

    private void showDetails(JSONObject recipe) {
        showingDetails = true;
        selectedRecipe = recipe;
        cardRenderer = null;
        content.removeAllViews();
        Button back = quietButton("←  All recipes");
        back.setOnClickListener(view -> renderCollection());
        content.addView(back);
        String category = recipe.optString("category", "");
        if (!category.isEmpty()) {
            TextView categoryView = text(category.toUpperCase(Locale.ROOT), 10, GREEN);
            categoryView.setTypeface(null, Typeface.BOLD);
            categoryView.setPadding(0, dp(16), 0, dp(4));
            content.addView(categoryView);
        }
        TextView title = text(recipe.optString("name", ""), 32, INK);
        title.setTypeface(Typeface.SERIF, Typeface.BOLD);
        title.setPadding(0, dp(6), 0, dp(4));
        content.addView(title);
        int rating = recipe.optInt("rating", 0);
        content.addView(text(rating == 0 ? "Not rated" : stars(rating), 16, rating == 0 ? MUTED : GOLD));

        LinearLayout actions = new LinearLayout(this);
        Button edit = primaryButton("Edit recipe");
        edit.setOnClickListener(view -> showRecipeForm(selectedRecipe));
        actions.addView(edit, new LinearLayout.LayoutParams(0, -2, 1));
        Button delete = quietButton("Delete");
        delete.setTextColor(Color.rgb(157, 56, 44));
        delete.setOnClickListener(view -> confirmDelete(selectedRecipe));
        LinearLayout.LayoutParams deleteParams = new LinearLayout.LayoutParams(0, -2, 1);
        deleteParams.leftMargin = dp(8);
        actions.addView(delete, deleteParams);
        actions.setPadding(0, dp(14), 0, dp(10));
        content.addView(actions);

        JSONArray images = recipe.optJSONArray("images");
        if (images != null) {
            for (int i = 0; i < images.length(); i++) {
                JSONObject image = images.optJSONObject(i);
                if (image == null) continue;
                ImageView photo = new ImageView(this);
                photo.setScaleType(ImageView.ScaleType.CENTER_CROP);
                content.addView(photo, new LinearLayout.LayoutParams(-1, dp(220)));
                loadImage(image.optString("url", ""), photo);
            }
        }
        section("Cooking details");
        List<String> meta = new ArrayList<>();
        if (recipe.optInt("cooking_time_minutes", 0) > 0) meta.add("Cooking time: " + recipe.optInt("cooking_time_minutes") + " min");
        if (recipe.has("cooking_temperature_f") && !recipe.isNull("cooking_temperature_f"))
            meta.add("Cooking temperature: " + number(recipe.optDouble("cooking_temperature_f")) + " °F");
        if (recipe.optInt("servings", 0) > 0) meta.add("Servings: " + recipe.optInt("servings"));
        if (meta.isEmpty()) content.addView(text("No cooking details", 14, MUTED));
        else for (String line : meta) content.addView(text(line, 15, INK));

        String notes = recipe.optString("notes", "");
        if (!notes.isEmpty()) {
            section("Notes");
            content.addView(text(notes, 15, INK));
        }
        addDetailList(recipe, "ingredients", "Ingredients", "• ");
        addDetailList(recipe, "steps", "Instructions", null);
        TextView footer = text("Made for the recipes that feel like home  ♥", 12, MUTED);
        footer.setGravity(Gravity.CENTER);
        footer.setPadding(0, dp(30), 0, dp(10));
        content.addView(footer);
    }

    private void addDetailList(JSONObject recipe, String key, String title, String bullet) {
        JSONArray values = recipe.optJSONArray(key);
        if (values == null || values.length() == 0) return;
        section(title);
        for (int i = 0; i < values.length(); i++) {
            String prefix = bullet == null ? (i + 1) + ". " : bullet;
            TextView line = text(prefix + values.optString(i), 15, INK);
            line.setPadding(0, dp(4), 0, dp(4));
            content.addView(line);
        }
    }

    private void section(String title) {
        TextView heading = text(title, 21, INK);
        heading.setTypeface(Typeface.SERIF, Typeface.BOLD);
        heading.setPadding(0, dp(20), 0, dp(8));
        content.addView(heading);
    }

    private void showRecipeForm(JSONObject recipe) {
        pendingImages.clear();
        formRecipe = recipe;
        boolean editing = recipe != null;
        LinearLayout form = new LinearLayout(this);
        form.setOrientation(LinearLayout.VERTICAL);
        form.setPadding(dp(20), dp(8), dp(20), dp(8));
        EditText name = addFormField(form, "Recipe name *", "e.g. Sunday tomato pasta", false, 1);
        name.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(120)});
        EditText rating = addFormField(form, "Your rating (1–5)", "Leave empty if unrated", false, 2);
        EditText notes = addFormField(form, "Notes", "What would you like to remember?", true, 0);
        EditText category = addFormField(form, "Category", "Choose or create a category", false, 1);
        category.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(60)});
        EditText cookingTime = addFormField(form, "Cooking time in minutes", "Optional", false, 3);
        EditText temperature = addFormField(form, "Cooking temperature in °F", "Optional", false, 4);
        EditText servings = addFormField(form, "Servings", "Optional", false, 3);
        EditText ingredients = addFormField(form, "Ingredients (one per line)", "Optional", true, 0);
        EditText steps = addFormField(form, "Steps (one per line)", "Optional", true, 0);

        if (editing) {
            name.setText(recipe.optString("name", ""));
            rating.setText(recipe.isNull("rating") ? "" : recipe.optString("rating"));
            notes.setText(recipe.optString("notes", ""));
            category.setText(recipe.optString("category", ""));
            cookingTime.setText(optionalNumber(recipe, "cooking_time_minutes"));
            temperature.setText(optionalNumber(recipe, "cooking_temperature_f"));
            servings.setText(optionalNumber(recipe, "servings"));
            ingredients.setText(joinLines(recipe.optJSONArray("ingredients")));
            steps.setText(joinLines(recipe.optJSONArray("steps")));
        }

        pictureCountLabel = text(imageCountLabel(recipe), 13, MUTED);
        pictureCountLabel.setPadding(0, dp(10), 0, dp(8));
        form.addView(pictureCountLabel);
        Button addPictures = quietButton("＋  Add pictures");
        addPictures.setOnClickListener(view -> pickImages());
        form.addView(addPictures, matchWrap());
        if (editing && recipe.optJSONArray("images") != null && recipe.optJSONArray("images").length() > 0) {
            Button removePicture = quietButton("Remove a picture");
            removePicture.setOnClickListener(view -> choosePictureToRemove(recipe));
            form.addView(removePicture, matchWrap());
        }

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(false);
        scroll.addView(form);
        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle(editing ? "Edit recipe" : "Add a recipe")
                .setView(scroll)
                .setNegativeButton("Cancel", null)
                .setPositiveButton("Save recipe", null)
                .create();
        dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view -> {
            String recipeName = name.getText().toString().trim();
            if (recipeName.isEmpty()) {
                name.setError("Recipe name is required.");
                return;
            }
            JSONObject payload;
            try {
                payload = formPayload(recipeName, rating, notes, category, cookingTime, temperature, servings, ingredients, steps);
            } catch (IllegalArgumentException error) {
                Toast.makeText(this, error.getMessage(), Toast.LENGTH_LONG).show();
                return;
            }
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(false);
            saveRecipe(recipe, payload, dialog);
        }));
        dialog.show();
        dialog.getWindow().setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
    }

    private EditText addFormField(LinearLayout form, String label, String hint, boolean multiline, int inputType) {
        TextView labelView = fieldLabel(label);
        labelView.setPadding(0, dp(11), 0, dp(4));
        form.addView(labelView);
        EditText field = editText(hint, multiline);
        if (inputType == 2) field.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);
        else if (inputType == 3) field.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);
        else if (inputType == 4) field.setInputType(android.text.InputType.TYPE_CLASS_NUMBER | android.text.InputType.TYPE_NUMBER_FLAG_DECIMAL);
        else if (!multiline) field.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        form.addView(field, matchWrap());
        return field;
    }

    private JSONObject formPayload(String name, EditText rating, EditText notes, EditText category,
                                   EditText cookingTime, EditText temperature, EditText servings,
                                   EditText ingredients, EditText steps) {
        JSONObject values = new JSONObject();
        try {
            values.put("name", name);
            values.put("rating", parseOptionalInteger(rating.getText().toString(), "Rating", 1, 5));
            values.put("notes", notes.getText().toString().trim());
            String categoryValue = category.getText().toString().trim();
            values.put("category", categoryValue.isEmpty() ? JSONObject.NULL : categoryValue);
            values.put("cooking_time_minutes", parseOptionalInteger(cookingTime.getText().toString(), "Cooking time", 1, Integer.MAX_VALUE));
            values.put("cooking_temperature_f", parseOptionalDecimal(temperature.getText().toString(), "Cooking temperature", 0));
            values.put("servings", parseOptionalInteger(servings.getText().toString(), "Servings", 1, Integer.MAX_VALUE));
            values.put("ingredients", lines(ingredients.getText().toString()));
            values.put("steps", lines(steps.getText().toString()));
        } catch (JSONException error) {
            throw new IllegalStateException(error);
        }
        return values;
    }

    private Integer parseOptionalInteger(String value, String label, int min, int max) {
        String clean = value.trim();
        if (clean.isEmpty()) return null;
        try {
            int parsed = Integer.parseInt(clean);
            if (parsed < min || parsed > max) throw new NumberFormatException();
            return parsed;
        } catch (NumberFormatException error) {
            throw new IllegalArgumentException(label + " must be a whole number from " + min + " to " + max + ".");
        }
    }

    private Double parseOptionalDecimal(String value, String label, double min) {
        String clean = value.trim();
        if (clean.isEmpty()) return null;
        try {
            double parsed = Double.parseDouble(clean);
            if (!Double.isFinite(parsed) || parsed < min) throw new NumberFormatException();
            return parsed;
        } catch (NumberFormatException error) {
            throw new IllegalArgumentException(label + " must be a number of " + min + " or more.");
        }
    }

    private JSONArray lines(String value) {
        JSONArray result = new JSONArray();
        for (String line : value.split("\\R")) {
            if (!line.trim().isEmpty()) result.put(line.trim());
        }
        return result;
    }

    private void saveRecipe(JSONObject original, JSONObject payload, AlertDialog dialog) {
        String path = original == null ? "/api/recipes" : "/api/recipes/" + original.optString("id");
        String method = original == null ? "POST" : "PUT";
        List<Uri> uploads = new ArrayList<>(pendingImages);
        executor.execute(() -> {
            JSONObject saved;
            try {
                saved = requestJson(method, path, payload);
            } catch (IOException error) {
                mainHandler.post(() -> {
                    dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(true);
                    Toast.makeText(this, error.getMessage(), Toast.LENGTH_LONG).show();
                    if (original != null) loadCollection();
                });
                return;
            }

            String pictureError = null;
            for (Uri image : uploads) {
                try {
                    uploadImage(saved.optString("id"), image);
                    mainHandler.post(() -> pendingImages.remove(image));
                } catch (IOException error) {
                    pictureError = error.getMessage();
                    break;
                }
            }
            String finalPictureError = pictureError;
            mainHandler.post(() -> {
                pendingImages.clear();
                dialog.dismiss();
                selectedRecipe = saved;
                loadCollection();
                Toast.makeText(this, finalPictureError == null
                        ? "Recipe saved."
                        : "Recipe saved, but a picture could not be uploaded: " + finalPictureError,
                        Toast.LENGTH_LONG).show();
            });
        });
    }

    private String imageCountLabel(JSONObject recipe) {
        int existing = recipe == null || recipe.optJSONArray("images") == null ? 0 : recipe.optJSONArray("images").length();
        return "Pictures: " + existing + " saved, " + pendingImages.size() + " selected (up to 10 total; 5 MB each)";
    }

    private void choosePictureToRemove(JSONObject recipe) {
        JSONArray images = recipe.optJSONArray("images");
        if (images == null || images.length() == 0) return;
        String[] options = new String[images.length()];
        for (int i = 0; i < images.length(); i++) options[i] = "Picture " + (i + 1);
        new AlertDialog.Builder(this)
                .setTitle("Remove which picture?")
                .setItems(options, (dialog, index) -> {
                    JSONObject image = images.optJSONObject(index);
                    if (image != null) removeImage(recipe, image.optString("id"));
                })
                .setNegativeButton("Cancel", null)
                .show();
    }

    private void removeImage(JSONObject recipe, String imageId) {
        executor.execute(() -> {
            try {
                requestJson("DELETE", "/api/recipes/" + recipe.optString("id") + "/images/" + imageId, null);
                JSONObject updated = requestJson("GET", "/api/recipes/" + recipe.optString("id"), null);
                mainHandler.post(() -> {
                    selectedRecipe = updated;
                    for (int i = 0; i < recipes.size(); i++) {
                        if (recipes.get(i).optString("id").equals(updated.optString("id"))) {
                            recipes.set(i, updated);
                            break;
                        }
                    }
                    showRecipeForm(updated);
                    Toast.makeText(this, "Picture removed.", Toast.LENGTH_SHORT).show();
                });
            } catch (IOException error) {
                mainHandler.post(() -> Toast.makeText(this, error.getMessage(), Toast.LENGTH_LONG).show());
            }
        });
    }

    private void pickImages() {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.setType("image/*");
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        startActivityForResult(intent, PICK_IMAGES);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != PICK_IMAGES || resultCode != RESULT_OK || data == null) return;
        List<Uri> chosen = new ArrayList<>();
        if (data.getClipData() != null) {
            for (int i = 0; i < data.getClipData().getItemCount(); i++)
                chosen.add(data.getClipData().getItemAt(i).getUri());
        } else if (data.getData() != null) {
            chosen.add(data.getData());
        }
        int existing = formRecipe == null || formRecipe.optJSONArray("images") == null
                ? 0 : formRecipe.optJSONArray("images").length();
        for (Uri uri : chosen) {
            if (existing + pendingImages.size() >= MAX_IMAGES) break;
            pendingImages.add(uri);
        }
        if (pictureCountLabel != null) pictureCountLabel.setText(imageCountLabel(formRecipe));
        Toast.makeText(this, pendingImages.size() + " picture(s) selected. Save the recipe to upload.", Toast.LENGTH_LONG).show();
    }

    private void uploadImage(String recipeId, Uri uri) throws IOException {
        String type = getContentResolver().getType(uri);
        if (type == null || !(type.equals("image/jpeg") || type.equals("image/png") || type.equals("image/webp")))
            throw new IOException("Pictures must be JPEG, PNG, or WebP.");
        byte[] bytes;
        try (InputStream input = getContentResolver().openInputStream(uri);
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            if (input == null) throw new IOException("Could not read the selected picture.");
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
                if (output.size() > MAX_IMAGE_BYTES) throw new IOException("Each picture must be 5 MB or smaller.");
            }
            bytes = output.toByteArray();
        }
        requestBytes("POST", "/api/recipes/" + recipeId + "/images", type, bytes);
    }

    private void loadCollection() {
        if (serverUrl.isEmpty()) {
            renderHome(null);
            return;
        }
        renderHome("Connecting to " + serverUrl + " …");
        executor.execute(() -> {
            try {
                JSONArray recipeArray = requestArray("GET", "/api/recipes");
                JSONArray categoryArray = requestArray("GET", "/api/categories");
                List<JSONObject> loadedRecipes = new ArrayList<>();
                for (int i = 0; i < recipeArray.length(); i++) {
                    JSONObject recipe = recipeArray.optJSONObject(i);
                    if (recipe != null) loadedRecipes.add(recipe);
                }
                List<String> loadedCategories = new ArrayList<>();
                for (int i = 0; i < categoryArray.length(); i++) {
                    String category = categoryArray.optString(i);
                    if (!category.isEmpty()) loadedCategories.add(category);
                }
                mainHandler.post(() -> {
                    recipes.clear();
                    recipes.addAll(loadedRecipes);
                    categories.clear();
                    categories.addAll(loadedCategories);
                    cardRenderer = null;
                    renderCollection();
                });
            } catch (IOException error) {
                mainHandler.post(() -> {
                    renderHome(error.getMessage());
                });
            }
        });
    }

    private void confirmDelete(JSONObject recipe) {
        new AlertDialog.Builder(this)
                .setTitle("Delete recipe?")
                .setMessage("“" + recipe.optString("name") + "” will be permanently deleted.")
                .setNegativeButton("Cancel", null)
                .setPositiveButton("Delete", (dialog, which) -> deleteRecipe(recipe))
                .show();
    }

    private void deleteRecipe(JSONObject recipe) {
        executor.execute(() -> {
            try {
                requestJson("DELETE", "/api/recipes/" + recipe.optString("id"), null);
                mainHandler.post(() -> {
                    selectedRecipe = null;
                    Toast.makeText(this, "Recipe deleted.", Toast.LENGTH_SHORT).show();
                    loadCollection();
                });
            } catch (IOException error) {
                mainHandler.post(() -> Toast.makeText(this, error.getMessage(), Toast.LENGTH_LONG).show());
            }
        });
    }

    private void showServerSettings() {
        EditText address = editText("http://192.168.1.20:8000", false);
        address.setSingleLine(true);
        address.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_URI);
        address.setText(serverUrl);
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(dp(22), dp(8), dp(22), 0);
        TextView help = text("Enter the base address of your mise server (for example, http://192.168.1.20:8000). The server must be reachable on your network to view and manage recipes.", 14, MUTED);
        layout.addView(help);
        address.setPadding(dp(12), dp(12), dp(12), dp(12));
        LinearLayout.LayoutParams addressParams = matchWrap();
        addressParams.topMargin = dp(12);
        layout.addView(address, addressParams);
        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle("Server address")
                .setView(layout)
                .setNegativeButton("Cancel", null)
                .setPositiveButton("Save & connect", null)
                .create();
        dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view -> {
            String normalized;
            try {
                normalized = normalizeUrl(address.getText().toString());
            } catch (IllegalArgumentException error) {
                address.setError(error.getMessage());
                return;
            }
            serverUrl = normalized;
            preferences.edit().putString("server_url", serverUrl).apply();
            selectedCategory = "";
            searchText = "";
            cardRenderer = null;
            dialog.dismiss();
            loadCollection();
        }));
        dialog.show();
    }

    private String normalizeUrl(String value) {
        String result = value.trim();
        while (result.endsWith("/")) result = result.substring(0, result.length() - 1);
        try {
            URI uri = new URI(result);
            if (!("http".equalsIgnoreCase(uri.getScheme()) || "https".equalsIgnoreCase(uri.getScheme()))
                    || uri.getHost() == null || uri.getRawQuery() != null || uri.getRawFragment() != null
                    || uri.getRawUserInfo() != null) throw new IllegalArgumentException();
        } catch (java.net.URISyntaxException | IllegalArgumentException error) {
            throw new IllegalArgumentException("Enter a valid http:// or https:// server URL.");
        }
        return result;
    }

    private JSONObject requestJson(String method, String path, JSONObject body) throws IOException {
        byte[] bytes = body == null ? null : body.toString().getBytes(StandardCharsets.UTF_8);
        byte[] response = requestBytes(method, path, "application/json; charset=utf-8", bytes);
        if (response == null || response.length == 0) return new JSONObject();
        try {
            return new JSONObject(new String(response, StandardCharsets.UTF_8));
        } catch (JSONException error) {
            throw new IOException("The server returned an invalid response.");
        }
    }

    private JSONArray requestArray(String method, String path) throws IOException {
        byte[] response = requestBytes(method, path, "application/json; charset=utf-8", null);
        try {
            return new JSONArray(new String(response, StandardCharsets.UTF_8));
        } catch (JSONException error) {
            throw new IOException("The server returned an invalid response.");
        }
    }

    private byte[] requestBytes(String method, String path, String contentType, byte[] body) throws IOException {
        HttpURLConnection connection = null;
        try {
            URL url = new URL(serverUrl + path);
            connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod(method);
            connection.setConnectTimeout(5000);
            connection.setReadTimeout(10000);
            connection.setRequestProperty("Accept", "application/json");
            if (body != null) {
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", contentType);
                connection.setFixedLengthStreamingMode(body.length);
                try (java.io.OutputStream output = connection.getOutputStream()) {
                    output.write(body);
                }
            }
            int status = connection.getResponseCode();
            if (status == HttpURLConnection.HTTP_NO_CONTENT) return null;
            InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            byte[] response;
            if (stream == null) response = new byte[0];
            else try (InputStream input = stream; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[8192];
                int read;
                while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
                response = output.toByteArray();
            }
            if (status < 200 || status >= 300) {
                String message = "Request failed (" + status + ").";
                try {
                    JSONObject error = new JSONObject(new String(response, StandardCharsets.UTF_8));
                    message = error.optString("error", message);
                } catch (JSONException ignored) {
                    // Keep the HTTP status when the server does not return a JSON error.
                }
                throw new IOException(message);
            }
            return response;
        } catch (java.net.SocketTimeoutException error) {
            throw new IOException("The server took too long to respond. Check the address and network.");
        } catch (java.net.UnknownHostException error) {
            throw new IOException("The server address could not be found. Check the address and network.");
        } catch (IOException error) {
            throw error;
        } catch (IllegalArgumentException error) {
            throw new IOException("The server URL is not valid.");
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private void loadImage(String path, ImageView target) {
        String imageUrl = serverUrl + path;
        target.setTag(imageUrl);
        executor.execute(() -> {
            try {
                byte[] bytes = requestBytes("GET", path, "image/*", null);
                Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                if (bitmap != null) mainHandler.post(() -> {
                    if (imageUrl.equals(target.getTag())) target.setImageBitmap(bitmap);
                });
            } catch (IOException ignored) {
                // A missing picture must not prevent browsing the recipe collection.
            }
        });
    }

    private String optionalNumber(JSONObject recipe, String key) {
        return recipe.isNull(key) ? "" : recipe.optString(key, "");
    }

    private String joinLines(JSONArray values) {
        if (values == null) return "";
        List<String> lines = new ArrayList<>();
        for (int i = 0; i < values.length(); i++) lines.add(values.optString(i));
        return android.text.TextUtils.join("\n", lines);
    }

    private String stars(int rating) {
        StringBuilder result = new StringBuilder();
        for (int i = 1; i <= 5; i++) result.append(i <= rating ? "★" : "☆");
        return result.toString();
    }

    private String number(double value) {
        if (value == Math.rint(value)) return String.valueOf((long) value);
        return String.valueOf(value);
    }

    private TextView text(String value, int sizeSp, int color) {
        TextView result = new TextView(this);
        result.setText(value);
        result.setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp);
        result.setTextColor(color);
        result.setGravity(Gravity.CENTER_VERTICAL);
        return result;
    }

    private TextView fieldLabel(String value) {
        TextView label = text(value, 13, INK);
        label.setTypeface(null, Typeface.BOLD);
        return label;
    }

    private EditText editText(String hint, boolean multiline) {
        EditText edit = new EditText(this);
        edit.setTextSize(15);
        edit.setTextColor(INK);
        edit.setHintTextColor(MUTED);
        edit.setHint(hint);
        edit.setPadding(dp(12), dp(10), dp(12), dp(10));
        edit.setBackgroundTintList(android.content.res.ColorStateList.valueOf(GREEN));
        if (multiline) {
            edit.setGravity(Gravity.TOP | Gravity.START);
            edit.setMinLines(3);
            edit.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE | android.text.InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        }
        return edit;
    }

    private LinearLayout card() {
        LinearLayout result = new LinearLayout(this);
        result.setOrientation(LinearLayout.VERTICAL);
        result.setBackgroundColor(CARD);
        result.setElevation(dp(1));
        return result;
    }

    private Button primaryButton(String label) {
        Button button = button(label, GREEN, Color.WHITE);
        button.setTypeface(null, Typeface.BOLD);
        return button;
    }

    private Button quietButton(String label) {
        return button(label, Color.rgb(235, 238, 230), GREEN);
    }

    private Button button(String label, int background, int foreground) {
        Button button = new Button(this);
        button.setText(label);
        button.setAllCaps(false);
        button.setTextSize(14);
        button.setTextColor(foreground);
        button.setBackgroundTintList(android.content.res.ColorStateList.valueOf(background));
        return button;
    }

    private LinearLayout.LayoutParams matchWrap() {
        return new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    }

    private LinearLayout.LayoutParams cardParams() {
        LinearLayout.LayoutParams params = matchWrap();
        params.topMargin = dp(12);
        return params;
    }

    private void addGap(LinearLayout target, int height) {
        View gap = new View(this);
        target.addView(gap, new LinearLayout.LayoutParams(1, dp(height)));
    }

    private int dp(int value) {
        return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        executor.shutdownNow();
    }

    @Override
    public void onBackPressed() {
        if (showingDetails) {
            renderCollection();
            return;
        }
        super.onBackPressed();
    }
}
