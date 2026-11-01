class Solution {
public:
    void rotate(vector<int>& nums, int k) {
        int size = nums.size();
        int shift = k%size;

        vector<int> temp;
        for(int i=size-shift;i<size;i++){
            temp.push_back(nums[i]);
        }

        for(int j=size-1;j>=shift;j--){
            nums[j] = nums[j-shift];
        }

        for(int k=0;k<shift;k++){
            nums[k] = temp[k];
        }
    }
};