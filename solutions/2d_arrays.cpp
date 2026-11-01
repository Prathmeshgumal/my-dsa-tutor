#include<iostream>
using namespace std;

int main(){
    //creation and initialization
    int arr[3][2] = {
        {1,2},
        {3,6},
        {4,1}
    };

    //access
    cout<<arr[0][0];
    cout<<endl;
    cout<<arr[2][0];

    //take input

    int brr[2][3];
    for(int i=0;i<3;i++){
        for(int j=0;j<2;j++){
            cout<<"Enter the value for"<<" row:"<<i<<" and col:"<<j;
            cin>>brr[i][j];
        }
    }
}