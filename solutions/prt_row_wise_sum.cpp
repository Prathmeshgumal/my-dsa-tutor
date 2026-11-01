#include<iostream>
using namespace std;

void prtRowSum(int arr[][3], int colsize, int rowsize){
    for(int i=0;i<rowsize;i++){
        int sum = 0;
        for(int j=0;j<colsize;j++){
            sum = sum+arr[i][j];
        }
        cout<<"Row sum for row "<<i<<" is "<< sum<<endl;

    }
}
void prtColSum(int arr[][3], int colsize, int rowsize){
    for(int i=0;i<colsize;i++){
        int sum = 0;
        for(int j=0;j<rowsize;j++){
            sum = sum+arr[j][i];
        }
        cout<<"Col sum for row "<<i<<" is "<< sum<<endl;

    }
}



int main(){
    int arr[3][3] = {
        {1,2,3},
        {4,5,6},
        {7,8,9}
    };
    prtRowSum(arr,3,3);
    cout<<endl;
    prtColSum(arr,3,3);
}