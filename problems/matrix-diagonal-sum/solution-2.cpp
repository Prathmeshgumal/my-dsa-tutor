class Solution {
public:
    int diagonalSum(vector<vector<int>>& mat) {
        int size = mat.size();
        int sum = 0;
        
        for(int i=0;i<size;i++){
            sum = sum + mat[i][i];
        }

        for(int j=0;j<size;j++){
            sum = sum + mat[j][size-1-j];
        }

        if(size%2 != 0){
            sum = sum - mat[size/2][size/2];
        }

        return sum;
    }
};