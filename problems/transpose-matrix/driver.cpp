int main() {
    judge::run([] {
        auto matrix = judge::read<vector<vector<int>>>();
        return Solution().transpose(matrix);
    });
}