package com.herbalance.service;

import java.util.List;

import org.springframework.stereotype.Service;

import com.herbalance.model.Food;
import com.herbalance.repository.FoodRepository;

@Service
public class FoodService {

    private final FoodRepository foodRepository;

    public FoodService(FoodRepository foodRepository) {
        this.foodRepository = foodRepository;
    }

    public List<Food> getAllFoods() {
        return foodRepository.findAll();
    }

    public Food addFood(Food food) {
        return foodRepository.save(food);
    }
}