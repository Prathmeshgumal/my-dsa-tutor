int main() {
    judge::run([] {
        auto nums = judge::read<vector<int>>();
        return Solution().pivotIndex(nums);
    });
}