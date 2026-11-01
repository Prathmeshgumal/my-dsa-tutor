# Matrix Diagonal Sum (LC 1572)

**Problem:** Given a square matrix `mat` (n × n), return the sum of the primary diagonal plus the secondary diagonal. A cell on both diagonals (the center, when n is odd) is counted **only once**.

Example: `[[1,2,3],[4,5,6],[7,8,9]]` → 1 + 5 + 9 + 3 + 7 = **25** (center 5 counted once)

## Key observations
- Primary diagonal: `i == j` → cell `mat[i][i]`
- Secondary diagonal: `i + j == n - 1` → cell `mat[i][n-1-i]`
- The two diagonals share a cell **only when n is odd**: the center `mat[n/2][n/2]`
- When n is even, they never meet, so nothing is double counted

---

## Approach 1: Brute force (check every cell)

Go through all n × n cells and add a cell if it's on either diagonal.

```cpp
class Solution {
public:
    int diagonalSum(vector<vector<int>>& mat) {
        int size = mat.size();
        int sum = 0;
        for(int i=0;i<size;i++){
            for(int j=0;j<size;j++){
                if(i == j or i+j == size-1){
                    sum = sum + mat[i][j];
                }
            }
        }
        return sum;
    }
};
```

- Because the condition uses `or`, the center is added once. (Two separate `if`s would add it twice.)
- **Time:** O(n²) because it checks every cell, even though only about 2n of them matter.
- **Space:** O(1)

---

## Approach 2: Optimal (go straight to the diagonals)

You already know where the diagonal cells are, so don't search for them:
1. Add the primary diagonal: `mat[i][i]`
2. Add the secondary diagonal: `mat[j][size-1-j]`
3. If `size` is **odd**, the center was added twice, so subtract it once.

```cpp
class Solution {
public:
    int diagonalSum(vector<vector<int>>& mat) {
        int size = mat.size();
        int sum = 0;

        for(int i=0;i<size;i++){
            sum = sum + mat[i][i];
        }

        for(int j=0;j<size;j++){
            sum = sum + mat[j][size-1-j];
        }

        if(size%2 != 0){
            sum = sum - mat[size/2][size/2];
        }

        return sum;
    }
};
```

- **Time:** O(n). This is optimal, since every diagonal cell has to be read at least once.
- **Space:** O(1)

**Shorter version (one loop):**
```cpp
for(int i=0;i<size;i++){
    sum += mat[i][i] + mat[i][size-1-i];
}
if(size % 2 != 0) sum -= mat[size/2][size/2];
```

---

## Mistake I made ⚠️
At first I wrote `if(size % 2 == 0)` for the subtraction. That's **backwards**:
- For odd n, it didn't remove the doubled center: 3×3 gave **30** instead of 25.
- For even n, it removed a cell that was counted only once: `[[1,2],[3,4]]` gave **6** instead of 10.

✅ The diagonals overlap only when n is **odd**, so subtract the center only then.

## Comparison
| | Brute force | Optimal |
|---|---|---|
| Time | O(n²) | **O(n)** |
| Space | O(1) | O(1) |
| Idea | check every cell | jump straight to `mat[i][i]` and `mat[i][n-1-i]` |
