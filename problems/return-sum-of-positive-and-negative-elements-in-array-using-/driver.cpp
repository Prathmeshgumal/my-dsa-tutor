int main() {
    judge::run([] {
        auto arr = judge::read<vector<int>>();
        pair<long long, long long> p = Solution().sumPositiveNegative(arr);
        return vector<long long>{p.first, p.second};
    });
}