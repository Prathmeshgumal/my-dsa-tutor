class Solution {
public:
    int findMode(const vector<int>& arr) {
        int size = arr.size();                              // FIX 1: declare size BEFORE using it
        vector<vector<int>> table(size,vector<int>(2,0));   // each row: {value, count}
        int filled = 0;                                     // FIX 2: how many rows are in use
        for(int i=0;i<size;i++){

            bool found = false;
            for(int j=0;j<filled;j++){                      // FIX 3: search only the filled rows
                if(table[j][0] == arr[i]){
                    table[j][1] = table[j][1] + 1;          // FIX 4: bump the MATCHING row j, not row i
                    found = true;
                    break;                                  // FIX 5: stop once found
                }
            }
            if(!found){                                     // FIX 6: only add a new row when no row matched
                table[filled][0] = arr[i];
                table[filled][1] = 1;
                filled++;
            }

        }
        int maxCount = 0;                                   // FIX 7: mode needs the MAX count, not min
        int mode = INT_MAX;
        for(int i=0;i<filled;i++){                          // FIX 8: loop over rows used, not table[0].size() (= 2 columns)
            if(table[i][1] > maxCount ||
               (table[i][1] == maxCount && table[i][0] < mode)){  // FIX 9: on a tie keep the smaller value
                maxCount = table[i][1];
                mode = table[i][0];
            }
        }

        return mode;                                        // FIX 10: return the element, not a count
    }
};