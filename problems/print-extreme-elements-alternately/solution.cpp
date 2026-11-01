class Solution {
public:
    vector<int> printExtremeElementsAlternately(vector<int>& arr) {
        sort(arr.begin(),arr.end());
        int size = arr.size();
        int start = 0;
        int end = size-1;
        vector<int>ans;
        if(size%2 ==0){
            while(start<end){
                ans.push_back(arr[start]);
                start++;
                ans.push_back(arr[end]);
                end--;
            }
        }
        else{
            while(start<=end){
                ans.push_back(arr[start]);
                start++;
                if(start<=end){
                    ans.push_back(arr[end]);
                }
                end--;
            }
        }
        return ans;
    }
};