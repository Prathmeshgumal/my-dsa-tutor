class Solution {
public:
    pair<long long, long long> sumPositiveNegative(const vector<int>& arr) {
        int size = arr.size();
        long long sum_positive = 0;
        long long sum_negative = 0;

        if(size>0){
            for(int i=0;i<size;i++){
                if(arr[i]>=0){
                    sum_positive = sum_positive+arr[i];
                }
                else{
                    sum_negative = sum_negative+arr[i];
                }
            }
        }
        return {sum_positive,sum_negative};

    }
};