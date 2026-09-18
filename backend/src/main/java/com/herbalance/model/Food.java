package com.herbalance.model;

import jakarta.persistence.*;
import java.math.BigDecimal;

@Entity
@Table(name = "foods")
public class Food {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "food_id")
    private Integer foodId;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private BigDecimal calories;

    private BigDecimal protein;
    private BigDecimal carbs;
    private BigDecimal fat;

    @Column(name = "serving_size_g")
    private BigDecimal servingSizeG;

    public Food() {
    }

    public Integer getFoodId() {
        return foodId;
    }

    public void setFoodId(Integer foodId) {
        this.foodId = foodId;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public BigDecimal getCalories() {
        return calories;
    }

    public void setCalories(BigDecimal calories) {
        this.calories = calories;
    }

    public BigDecimal getProtein() {
        return protein;
    }

    public void setProtein(BigDecimal protein) {
        this.protein = protein;
    }

    public BigDecimal getCarbs() {
        return carbs;
    }

    public void setCarbs(BigDecimal carbs) {
        this.carbs = carbs;
    }

    public BigDecimal getFat() {
        return fat;
    }

    public void setFat(BigDecimal fat) {
        this.fat = fat;
    }

    public BigDecimal getServingSizeG() {
        return servingSizeG;
    }

    public void setServingSizeG(BigDecimal servingSizeG) {
        this.servingSizeG = servingSizeG;
    }
}