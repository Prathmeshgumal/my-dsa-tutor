#include<iostream>
#include<vector>
using namespace std;

int main(){
    vector<int> v;
    cout<<"start -> size="<<v.size()<<" cap="<<v.capacity()<<endl;
    for(int i=1;i<=9;i++){
        v.push_back(i*10);
        cout<<"push "<<i*10<<" -> size="<<v.size()<<" cap="<<v.capacity()<<endl;
    }
    return 0;
}
