#include<iostream>
using namespace std;

void sortZerosAndOnes(int arr[], int size){
    int start = 0;
    int end = size-start-1;
    while(start<end){
        if(arr[start]>arr[end]){
            swap(arr[start],arr[end]);
            start ++;
            end --;
        }
        else if(arr[start] == 1){
            end --;
        }
        else if(arr[end] == 0){
            start ++;
        }
        else{
            start ++;
            end --;
        }
    }
}

void prtArr(int arr[], int size){
    for(int i=0;i<size;i++){
        cout<<arr[i]<<",";
    }
    cout<<endl;
}

int main(){
    int arr[]={1,1,0,1,0,0,1,1,1};
    int size = 9;
    int brr[]={1,1,1,1,1,1,1,1,1};
    int crr[]={0,0,1,1,0,1,1,0,0};
    sortZerosAndOnes(arr,size);
    sortZerosAndOnes(brr,size);
    sortZerosAndOnes(crr,size);

    prtArr(arr,size);
    prtArr(brr,size);
    prtArr(crr,size);

    // edge cases
    int drr[]={0};
    int err[]={1};
    int frr[]={1,0};
    int grr[]={0,1};
    int hrr[]={0,0,0};
    sortZerosAndOnes(arr,0);    // size 0: should do nothing
    sortZerosAndOnes(drr,1);
    sortZerosAndOnes(err,1);
    sortZerosAndOnes(frr,2);
    sortZerosAndOnes(grr,2);
    sortZerosAndOnes(hrr,3);

    prtArr(arr,0);
    prtArr(drr,1);
    prtArr(err,1);
    prtArr(frr,2);
    prtArr(grr,2);
    prtArr(hrr,3);

}