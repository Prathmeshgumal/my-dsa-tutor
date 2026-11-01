int main() {
    judge::run([] {
        auto mat = judge::read<vector<vector<int>>>();
        return Solution().diagonalSum(mat);
    });
}