#include<iostream>
#include<vector>
using namespace std;

/*
 3Sum
 Given an integer array `arr`, return all the unique triplets
 [arr[i], arr[j], arr[k]] such that i, j, k are different indices and
 arr[i] + arr[j] + arr[k] == 0.
 The answer must not contain duplicate triplets (order inside a triplet
 and order of triplets doesn't matter).

 Example: arr = {-1,0,1,2,-1,-4}  ->  [[-1,-1,2],[-1,0,1]]
*/

vector<vector<int>> threeSum(vector<int>& arr){
    vector<vector<int>> result;
    
    int size = arr.size();

    for(int i=0;i<size;i++){
        for(int j=i+1;j<size;j++){
            for(int k=j+1;k<size;k++){
                if(arr[i]+arr[j]+arr[k] == 0){
                    result.push_back({arr[i],arr[j],arr[k]});
                }
            }
        }
    }
    return result;
}

void prtResult(const vector<vector<int>>& res){
    cout<<"[";
    for(int i=0;i<res.size();i++){
        cout<<"["<<res[i][0]<<","<<res[i][1]<<","<<res[i][2]<<"]";
        if(i+1<res.size()) cout<<",";
    }
    cout<<"]"<<endl;
}

int main(){
    vector<int> a = {-1,0,1,2,-1,-4};
    vector<int> b = {0,1,1};
    vector<int> c = {0,0,0};
    vector<int> d = {0,0,0,0};
    vector<int> e = {-2,0,1,1,2};
    vector<int> f = {};

    prtResult(threeSum(a));    // expected [[-1,-1,2],[-1,0,1]]
    prtResult(threeSum(b));    // expected []
    prtResult(threeSum(c));    // expected [[0,0,0]]
    prtResult(threeSum(d));    // expected [[0,0,0]]   (no duplicates!)
    prtResult(threeSum(e));    // expected [[-2,0,2],[-2,1,1]]
    prtResult(threeSum(f));    // expected []
}
