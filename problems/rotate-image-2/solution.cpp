class Solution {
public:
    void rotate(vector<vector<int>>& matrix) {
        int size = matrix.size();

        for(int i=0;i<size;i++){
            for(int j=i;j<size;j++){
                swap(matrix[i][j],matrix[j][i]);
            }
        }
        int i=0;
        int j=size-1;
        while(j>=i){
            for(int k=0;k<size;k++){
                swap(matrix[k][i],matrix[k][j]);
            }
            i++;
            j--;
        }

    }
};