package com.herbalance.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import com.herbalance.model.Food;

public interface FoodRepository extends JpaRepository<Food, Integer> {

}