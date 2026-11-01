#include<iostream>
using namespace std;

void search(int arr[][3], int rowsize, int colsize, int target){
    for(int i=0;i<rowsize;i++){
        for(int j=0;j<colsize;j++){
            if(arr[i][j] == target){
                cout<<"Element found at i = "<<i<<", j = "<<j<<".";
            }
        }
    }
}

int main(){
    int arr[3][3] = {
        {1,2,3},
        {4,5,6},
        {7,8,9}
    };

    search(arr,3,3,8);
}