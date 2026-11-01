#include<iostream>
#include<vector>
using namespace std;

/*
 Two Sum
 Given an array of integers `arr` and an integer `target`, return the
 indices of the two numbers that add up to `target`.
 You may assume exactly one solution exists, and you may not use the
 same element twice.

 Example: arr = {2,7,11,15}, target = 9  ->  {0,1}
*/

vector<int> twoSum(vector<int>& arr, int target){
    int size = arr.size();
    for(int i=0;i<size;i++){
        for(int j=i+1;j<size;j++){
            if(arr[i]+arr[j] == target){
                return {i,j};
            }
        }
    }

    return {-1, -1};   // placeholder: no pair found
}

void prtResult(const vector<int>& res){
    cout<<"["<<res[0]<<","<<res[1]<<"]"<<endl;
}

int main(){
    vector<int> a = {2,7,11,15};
    vector<int> b = {3,2,4};
    vector<int> c = {3,3};
    vector<int> d = {-1,-2,-3,-4,-5};
    vector<int> e = {0,4,3,0};

    prtResult(twoSum(a, 9));    // expected [0,1]
    prtResult(twoSum(b, 6));    // expected [1,2]
    prtResult(twoSum(c, 6));    // expected [0,1]
    prtResult(twoSum(d, -8));   // expected [2,4]
    prtResult(twoSum(e, 0));    // expected [0,3]
}
