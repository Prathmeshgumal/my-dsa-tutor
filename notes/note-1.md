# Two Sum – Approaches

Solution file: `two_sum.cpp`

| # | Approach | Time | Space | Status |
|---|---|---|---|---|
| 1 | Brute force (nested loops) | O(n²) | O(1) | ✅ Done |
| 2 | Sort + two pointers | O(n log n) | O(n) | ⬜ TODO |
| 3 | Hash map, one pass | O(n) avg | O(n) | ⬜ TODO |

## 1. Brute force ✅ (solved this way)
- For every `i`, check every `j > i`: `arr[i] + arr[j] == target`?
- `j` starts at `i+1` → never reuse the same element or pair.

## 2. Sort + two pointers
- Store `(value, original index)` pairs, sort by value.
- `left = 0`, `right = n-1`:
  - sum < target → `left++`
  - sum > target → `right--`
  - equal → found
- Keep the original indices, since sorting moves elements.

## 3. Hash map, one pass
- `unordered_map<int,int> seen;  // value -> index`
- For each `i`: if `target - arr[i]` is in `seen` → return `{seen[target - arr[i]], i}`, else `seen[arr[i]] = i`.
- Check **before** inserting so an element doesn't pair with itself.

