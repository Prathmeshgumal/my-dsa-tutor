# 3Sum – Approaches

Solution file: `three_sum.cpp`
Goal: all **unique** triplets of **values** with `a + b + c == 0`.

| # | Approach | Time | Extra space | Status |
|---|---|---|---|---|
| 1 | Brute force (3 loops) + set for duplicates | O(n³ log m) | O(m) | 🟡 In progress |
| 2 | Hashing (fix `i`, Two Sum with a hash set) | O(n² log m) | O(n + m) | ⬜ TODO |
| 3 | Sort + two pointers | O(n²) | O(1)* | ⬜ TODO |

*not counting the output and the sort. m = number of unique triplets.

## 1. Brute force 🟡 (current attempt)
- Three loops: `i < j < k`, check `arr[i] + arr[j] + arr[k] == 0`.
- Push the **values** `{arr[i], arr[j], arr[k]}`, not the indices `{i, j, k}`.
- **Remove duplicates:** sort each triplet, then insert it into a `set<vector<int>>`. Copy the set into the result at the end.
- Status: loops and the sum check work; still pushing indices, and duplicates aren't handled yet.

## 2. Hashing (reuse Two Sum's hash map idea)
- Fix `arr[i]`. For each `j > i`, the needed third value is `-(arr[i] + arr[j])`.
- Keep a `set<int>` of the values seen between `i` and `j`. If the needed value is in it, you've found a triplet.
- Insert `arr[j]` into the hash set **after** checking (same rule as Two Sum).
- Still needs sort-triplet + `set<vector<int>>` to remove duplicates.

## 3. Sort + two pointers (optimal)
- `sort(arr)` first.
- For each `i`: skip it if `arr[i] == arr[i-1]` (a duplicate first element).
- `left = i+1`, `right = n-1`, sum = `arr[i] + arr[left] + arr[right]`:
  - sum < 0 → `left++`
  - sum > 0 → `right--`
  - sum == 0 → save it, then move both pointers **and skip equal values** on each side.
- No set needed: sorting plus skipping already removes the duplicates.
- Early exit: if `arr[i] > 0`, stop (nothing after it can sum to 0).
- This is Two Sum approach #2 (sort + two pointers) run once for each `i`.

## Related
- Two Sum note → approaches 2 and 3 here build directly on Two Sum's hash map and two-pointer ideas.
