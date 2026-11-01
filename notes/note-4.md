# Rotate an Array: notes

## Current solution: O(n) time, O(k) space ✅ (all tests pass)

```cpp
int size = nums.size();
int shift = k % size;

vector<int> temp;
for (int i = size - shift; i < size; i++)   // save last `shift` elements (in order)
    temp.push_back(nums[i]);

for (int j = size - 1; j >= shift; j--)     // shift the rest right, going right → left
    nums[j] = nums[j - shift];

for (int k = 0; k < shift; k++)             // put saved elements at the front
    nums[k] = temp[k];
```

## Bugs I hit along the way
- **Save loop backwards** (`i` from the end going down) put `temp` in **reverse** order.
- **Hard-coded `j-2`** only worked when `shift == 2`. Use `j - shift`.
- **Wrong loop bound** `j >= size-1-shift`: it worked only when `size-1-shift == shift` (e.g. Example 1). The correct bound is `j >= shift` (the last index written gets `nums[0]`).
- **Off-by-one** `i <= size` reads `nums[size]`, which is out of bounds. Use `i < size`.
- **`j >= 0`** read `nums[-1]`, `nums[-2]`... Tests still passed because copy-back overwrote the garbage, but it's **undefined behaviour**. Passing tests ≠ correct code.
- **Lesson:** test with several `k` values on the same array; one example can hide a bug.

## TODO: O(1) space version
Hints:
1. The answer is two blocks swapped: `[5,6,7 | 1,2,3,4]`, with each block's inner order unchanged.
2. Reverse the **whole** array → the blocks are in the right place but backwards inside.
3. Then reverse the **first k** and the **remaining n-k** separately.
4. Reverse a range `[l, r]` in place with two pointers: swap and move inward. No extra array.
