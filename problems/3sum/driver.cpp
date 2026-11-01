int main() {
    judge::run([] {
        auto arr = judge::read<vector<int>>();
        return Solution().threeSum(arr);
    });
}