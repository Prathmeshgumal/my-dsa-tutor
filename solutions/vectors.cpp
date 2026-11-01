#include<iostream>
#include<vector>
using namespace std;

class Solution {
public:
    vector<int> shiftRight(vector<int>& arr) {
        int size = arr.size();
        int end = arr[size-1];
        for(int i=size-1; i>0; i--){
            arr[i] = arr[i-1];
        }
        arr[0] = end;
        return arr;
    }
};

void print(const vector<int>& v){
    cout << "[";
    for(int i = 0; i < (int)v.size(); i++){
        cout << v[i] << (i + 1 < (int)v.size() ? ", " : "");
    }
    cout << "]";
}

int main(){
    vector<vector<int>> inputs = {
        {1, 2, 3, 4},
        {1, 2},
        {1},
        {5, 6, 7},
        {10, 20, 30, 40, 50},
        {-1, -2, 0, 3, 8, 9},
        {7, 7, 7, 7, 7, 7, 7},
        {1, 2, 3, 4, 5, 6, 7, 8},
        {9, 8, 7, 6, 5, 4, 3, 2, 1, 0},
        {11, 22, 33, 44, 55, 66, 77, 88, 99}
    };
    vector<vector<int>> expected = {
        {4, 1, 2, 3},
        {2, 1},
        {1},
        {7, 5, 6},
        {50, 10, 20, 30, 40},
        {9, -1, -2, 0, 3, 8},
        {7, 7, 7, 7, 7, 7, 7},
        {8, 1, 2, 3, 4, 5, 6, 7},
        {0, 9, 8, 7, 6, 5, 4, 3, 2, 1},
        {99, 11, 22, 33, 44, 55, 66, 77, 88}
    };

    Solution sol;
    for(int t = 0; t < (int)inputs.size(); t++){
        vector<int> arr = inputs[t];
        vector<int> got = sol.shiftRight(arr);
        cout << "Test " << t + 1 << ": input ";
        print(inputs[t]);
        cout << " -> got ";
        print(got);
        cout << ", expected ";
        print(expected[t]);
        cout << (got == expected[t] ? "  PASS" : "  FAIL") << "\n";
    }
    return 0;
}