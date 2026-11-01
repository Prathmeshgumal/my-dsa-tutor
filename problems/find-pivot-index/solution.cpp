class Solution {
public:
    int pivotIndex(vector<int>& nums) {
        int size = nums.size();
        int tsum = 0;
        for(int i=0;i<size;i++){
            tsum = tsum+nums[i];
        }

        int lsum = 0;
        int rsum = tsum-nums[0];

        for(int i=0;i<size;i++){

            if(lsum==rsum){
                return i;
            }
            lsum = lsum+nums[i];
            if(i+1<size){
                rsum = rsum-nums[i+1];
            }
        }

        return -1;
    }
};