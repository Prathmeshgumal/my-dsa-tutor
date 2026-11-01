int main() {
    judge::run([] {
        auto nums = judge::read<vector<int>>();
        auto target = judge::read<int>();
        return Solution().searchRange(nums, target);
    });
}