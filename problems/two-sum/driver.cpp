int main() {
    judge::run([] {
        auto arr = judge::read<vector<int>>();
        auto target = judge::read<int>();
        return Solution().twoSum(arr, target);
    });
}