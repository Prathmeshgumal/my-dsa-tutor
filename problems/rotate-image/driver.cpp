int main() {
    judge::run([] {
        auto matrix = judge::read<vector<vector<int>>>();
        Solution().rotate(matrix);
        return matrix;
    });
}