int main() {
    judge::run([] {
        auto nums = judge::read<vector<int>>();
        auto k = judge::read<int>();
        Solution().rotate(nums, k);
        return nums;
    });
}