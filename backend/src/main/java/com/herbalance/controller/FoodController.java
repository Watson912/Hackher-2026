package com.herbalance.controller;

import java.util.List;

import org.springframework.web.bind.annotation.*;

import com.herbalance.model.Food;
import com.herbalance.service.FoodService;

@RestController
@RequestMapping("/api/foods")
@CrossOrigin(origins = "*")

public class FoodController {

    private final FoodService foodService;

    public FoodController(FoodService foodService) {
        this.foodService = foodService;
    }

    @GetMapping
    public List<Food> getAllFoods() {
        return foodService.getAllFoods();
    }

    @PostMapping
    public Food addFood(@RequestBody Food food) {
        return foodService.addFood(food);
    }
}