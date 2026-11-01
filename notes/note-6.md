# Transpose Matrix – Approaches

**Transpose:** flip the matrix over its main diagonal, so `[i][j]` goes to `[j][i]`.
An `m × n` matrix becomes `n × m`.

---

## Approach 1: New result matrix (works for any shape) ✅ Optimal

**Idea:** make a new `n × m` matrix and copy each `matrix[i][j]` into `result[j][i]`.

```cpp
class Solution {
public:
    vector<vector<int>> transpose(vector<vector<int>>& matrix) {
        int rows = matrix.size();
        int col = matrix[0].size();
        vector<vector<int>> result(col, vector<int>(rows));   // n × m, sizes swapped!

        for (int i = 0; i < rows; i++) {
            for (int j = 0; j < col; j++) {
                result[j][i] = matrix[i][j];
            }
        }
        return result;
    }
};
```

- **Time:** O(m·n), every cell is visited once.
- **Space:** O(m·n) for the result, which is the answer itself. Besides that, O(1).
- You can't do better, because all m·n values have to be written to the output.

---

## Approach 2: In-place swap (only for square matrices, m == n)

**Idea:** cells on the diagonal (`i == j`) stay where they are. Every other cell swaps with its mirror cell,
`matrix[i][j]` ↔ `matrix[j][i]`.

```cpp
int n = matrix.size();
for (int i = 0; i < n; i++) {
    for (int j = i + 1; j < n; j++) {     // only above the diagonal
        swap(matrix[i][j], matrix[j][i]);
    }
}
return matrix;
```

- **Time:** O(n²)
- **Space:** O(1) extra
- ⚠️ Start `j` at `i + 1`. If you loop over all `j`, every pair is swapped twice and you get the original matrix back.
- ❌ This doesn't work for `m ≠ n`, because the output has a different shape (e.g. 2×3 → 3×2).

---

## Mistakes I made 🐞

1. **`==` vs `=`:** `result[j][i] == matrix[i][j];` only compares the two values and writes nothing, so the result was all zeros.
2. **Wrong result shape:** I created `result(rows, vector<int>(col))`, the same shape as the input.
   It has to be `result(col, vector<int>(rows))`, otherwise `result[j]` goes out of bounds when `m ≠ n`.

## Syntax reminders

```cpp
int m = matrix.size();        // number of rows
int n = matrix[0].size();     // number of cols
vector<vector<int>> a(m, vector<int>(n, 0));   // m × n filled with 0
```
