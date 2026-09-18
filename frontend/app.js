async function loadFoods() {

    const response = await fetch("http://localhost:8080/api/foods");

    const foods = await response.json();

    const foodList = document.getElementById("foodList");

    foodList.innerHTML = "";

    foods.forEach(food => {

        foodList.innerHTML += `
            <div>
                <h3>${food.name}</h3>
                <p>Calories: ${food.calories}</p>
                <p>Protein: ${food.protein}g</p>
                <p>Carbs: ${food.carbs}g</p>
                <p>Fat: ${food.fat}g</p>
            </div>
        `;
    });
}