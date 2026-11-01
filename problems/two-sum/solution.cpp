class Solution {
public:
    vector<int> twoSum(vector<int>& arr, int target) {
        int size = arr.size();
        for(int i=0;i<size;i++){
            for(int j=i+1;j<size;j++){
                if(att[i]+arr[j] == target){
                    return {i,j};
                }
            }
        }
    }
};