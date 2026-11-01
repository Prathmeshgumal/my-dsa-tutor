# C++ Vectors – Syntax Cheat Sheet

`#include <vector>` • `using namespace std;`

## 1. Declaring and initializing
```cpp
vector<int> v;                 // empty, size 0
vector<int> v(5);              // 5 elements, all 0
vector<int> v(5, -1);          // 5 elements, all -1
vector<int> v = {1, 2, 3};     // initializer list
vector<int> v2(v);             // copy of v
vector<int> v3(v.begin(), v.begin() + 2); // copy of a range -> {1,2}
int arr[] = {4, 5, 6};
vector<int> v4(arr, arr + 3);  // from an array
```

## 2. Accessing elements
```cpp
v[i]          // no bounds check (fast; out of range = undefined behaviour)
v.at(i)       // bounds check, throws out_of_range
v.front()     // first element
v.back()      // last element
v.data()      // pointer to the underlying array
```

## 3. Size and capacity
```cpp
v.size()          // number of elements stored
v.capacity()      // number of slots allocated (>= size)
v.empty()         // true if size == 0
v.reserve(100)    // allocate at least 100 slots, size stays the same
v.resize(10)      // change size (new elements = 0)
v.resize(10, 7)   // change size, new elements = 7
v.shrink_to_fit() // ask to reduce capacity down to size
```
> When `size == capacity` and you `push_back`, the vector allocates a **bigger block** (GCC doubles it: 1→2→4→8→16…), **copies/moves** everything over, and frees the old block.
> So `push_back` is **amortized O(1)**, but sometimes it costs O(n).
> A reallocation **invalidates** all iterators, pointers and references into the vector.
> Use `reserve(n)` when you know the final size, so it never has to reallocate.

## 4. Adding and removing
```cpp
v.push_back(x);              // add at end (copies x)
v.emplace_back(x);           // build the element in place at the end
v.pop_back();                // remove last element (doesn't return it!)
v.insert(v.begin() + i, x);  // insert x at index i         O(n)
v.insert(v.begin(), 3, x);   // insert 3 copies of x at the front
v.erase(v.begin() + i);      // remove index i              O(n)
v.erase(v.begin() + l, v.begin() + r); // remove range [l, r)
v.clear();                   // size -> 0 (capacity unchanged)
```

## 5. Iterating
```cpp
for (int i = 0; i < (int)v.size(); i++) cout << v[i];   // index
for (int x : v)        cout << x;    // by value (copy)
for (int &x : v)       x *= 2;       // by reference (can modify)
for (const auto &x : v) cout << x;   // read-only, no copy
for (auto it = v.begin(); it != v.end(); ++it) cout << *it;  // iterator
for (auto it = v.rbegin(); it != v.rend(); ++it) cout << *it; // reverse
```
> ⚠️ `v.size()` is **unsigned**. `v.size() - 1` when the vector is empty wraps around to a huge number. Cast with `(int)v.size()` first.

## 6. Common `<algorithm>` helpers
```cpp
#include <algorithm>
#include <numeric>
sort(v.begin(), v.end());                 // ascending
sort(v.begin(), v.end(), greater<int>()); // descending
reverse(v.begin(), v.end());
*max_element(v.begin(), v.end());
*min_element(v.begin(), v.end());
accumulate(v.begin(), v.end(), 0LL);      // sum (needs <numeric>)
count(v.begin(), v.end(), x);
find(v.begin(), v.end(), x) != v.end();   // contains?
binary_search(v.begin(), v.end(), x);     // only on sorted data
lower_bound(v.begin(), v.end(), x) - v.begin(); // first index >= x
upper_bound(v.begin(), v.end(), x) - v.begin(); // first index >  x
v.erase(unique(v.begin(), v.end()), v.end());   // remove duplicates (sort first)
```

## 7. 2D vectors
```cpp
vector<vector<int>> g(n, vector<int>(m, 0)); // n x m grid filled with 0
g[i][j] = 5;
g.size();      // rows
g[0].size();   // columns
vector<vector<int>> adj(n);  // adjacency list
adj[u].push_back(v);
```

## 8. Passing to functions
```cpp
void f(vector<int> v);         // copy: O(n), changes are NOT seen outside
void f(vector<int>& v);        // reference: no copy, can modify
void f(const vector<int>& v);  // read-only, no copy  ← default choice
vector<int> make();            // returning a vector is cheap (move/RVO)
```

## 9. Other useful operations
```cpp
v1 == v2; v1 < v2;   // compares element by element (lexicographic)
v1.swap(v2);         // O(1) swap
v.assign(5, 0);      // replace contents with five 0s
```

## Complexity summary
| Operation | Time |
|---|---|
| `v[i]`, `at`, `front`, `back` | O(1) |
| `push_back` / `pop_back` | amortized O(1) / O(1) |
| `insert` / `erase` (middle) | O(n) |
| `find` / `count` | O(n) |
| `sort` | O(n log n) |
