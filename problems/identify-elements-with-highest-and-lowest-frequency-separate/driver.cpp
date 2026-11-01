int main() {
    judge::run([] {
        auto arr = judge::read<vector<int>>();
        auto p = Solution().highestAndLowestFrequency(arr);
        return vector<int>{p.first, p.second};
    });
}