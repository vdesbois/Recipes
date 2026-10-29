async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const body = response.status === 204 ? null : await response.json();

  if (!response.ok) {
    throw new Error(body.error ?? `Request failed (${response.status}).`);
  }
  return body;
}

export function getRecipes() {
  return request("/api/recipes");
}

export function getRecipe(recipeId) {
  return request(`/api/recipes/${encodeURIComponent(recipeId)}`);
}

export function getCategories() {
  return request("/api/categories");
}

export function saveRecipe(values, recipeId) {
  return recipeId
    ? request(`/api/recipes/${encodeURIComponent(recipeId)}`, {
      method: "PUT",
      body: JSON.stringify(values),
    })
    : request("/api/recipes", {
      method: "POST",
      body: JSON.stringify(values),
    });
}

export function deleteRecipe(recipeId) {
  return request(`/api/recipes/${encodeURIComponent(recipeId)}`, { method: "DELETE" });
}

export function uploadRecipeImage(recipeId, file) {
  return request(`/api/recipes/${encodeURIComponent(recipeId)}/images`, {
    method: "POST",
    headers: { "Content-Type": file.type },
    body: file,
  });
}

export function deleteRecipeImage(recipeId, imageId) {
  return request(
    `/api/recipes/${encodeURIComponent(recipeId)}/images/${encodeURIComponent(imageId)}`,
    { method: "DELETE" },
  );
}
