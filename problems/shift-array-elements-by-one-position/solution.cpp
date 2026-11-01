class Solution {
public:
    vector<int> shiftRight(vector<int>& arr) {
        int size = arr.size();
        if(size ==0){
            return arr;
        }
        
        else{
            int end = arr[size-1];
            for(int i=size-1;i>0;i--){
            arr[i] = arr[i-1];
        }
        arr[0] = end;
        }
        return arr;
    }
};