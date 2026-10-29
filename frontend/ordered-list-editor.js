import { t } from "./i18n.js";

export function createOrderedListEditor(root, addButton, itemName) {
  function getValues() {
    return Array.from(root.querySelectorAll("textarea"), (input) => input.value);
  }

  function setValues(values) {
    root.replaceChildren(...values.map((value, index) => {
      const item = document.createElement("li");
      item.className = "recipe-step-row";

      const input = document.createElement("textarea");
      input.className = "recipe-step-input";
      input.rows = 2;
      input.value = value;
      input.setAttribute(
        "aria-label",
        `${t(itemName === "step" ? "item.stepLabel" : "item.ingredientLabel")} ${index + 1}`,
      );

      const controls = document.createElement("div");
      controls.className = "recipe-step-controls";
      for (const [action, label, symbol, disabled] of [
        ["up", t("action.moveItemUp", { item: t(itemName === "step" ? "item.step" : "item.ingredient"), number: index + 1 }), "↑", index === 0],
        ["down", t("action.moveItemDown", { item: t(itemName === "step" ? "item.step" : "item.ingredient"), number: index + 1 }), "↓", index === values.length - 1],
      ]) {
        const button = document.createElement("button");
        button.className = "step-order-button";
        button.type = "button";
        button.dataset.itemAction = action;
        button.dataset.itemIndex = String(index);
        button.disabled = disabled;
        button.setAttribute("aria-label", label);
        button.textContent = symbol;
        controls.append(button);
      }

      const removeButton = document.createElement("button");
      removeButton.className = "step-remove-button";
      removeButton.type = "button";
      removeButton.dataset.itemAction = "remove";
      removeButton.dataset.itemIndex = String(index);
      removeButton.setAttribute("aria-label", t("action.removeItem", {
        item: t(itemName === "step" ? "item.step" : "item.ingredient"),
        number: index + 1,
      }));
      removeButton.textContent = t("action.remove");
      controls.append(removeButton);
      item.append(input, controls);
      return item;
    }));
  }

  addButton.addEventListener("click", () => {
    setValues([...getValues(), ""]);
    root.querySelector("li:last-child textarea").focus();
  });

  root.addEventListener("click", (event) => {
    const button = event.target.closest("[data-item-action]");
    if (!button) {
      return;
    }

    const values = getValues();
    const index = Number(button.dataset.itemIndex);
    if (button.dataset.itemAction === "remove") {
      values.splice(index, 1);
    } else {
      const targetIndex = button.dataset.itemAction === "up" ? index - 1 : index + 1;
      [values[index], values[targetIndex]] = [values[targetIndex], values[index]];
    }
    setValues(values);
  });

  return { getValues, setValues };
}
