int main() {
    judge::run([] {
        auto head = judge::read<ListNode*>();
        return Solution().reverseList(head);
    });
}