#include <bits/stdc++.h>
using namespace std;

struct ListNode {
    int val;
    ListNode *next;
    ListNode() : val(0), next(nullptr) {}
    ListNode(int x) : val(x), next(nullptr) {}
    ListNode(int x, ListNode *next) : val(x), next(next) {}
};

struct TreeNode {
    int val;
    TreeNode *left;
    TreeNode *right;
    TreeNode() : val(0), left(nullptr), right(nullptr) {}
    TreeNode(int x) : val(x), left(nullptr), right(nullptr) {}
    TreeNode(int x, TreeNode *left, TreeNode *right) : val(x), left(left), right(right) {}
};

namespace judge {
struct Reader {
    const string &s;
    size_t i = 0;
    [[noreturn]] void fail(const string &why) {
        cerr << "Bad test input (" << why << "): " << s << endl;
        exit(3);
    }
    void ws() { while (i < s.size() && isspace((unsigned char)s[i])) i++; }
    bool eat(char c) {
        ws();
        if (i < s.size() && s[i] == c) { i++; return true; }
        return false;
    }
    void expect(char c) { if (!eat(c)) fail(string("expected '") + c + "'"); }
    string token() {
        ws();
        size_t j = i;
        while (i < s.size() && !strchr(",]", s[i]) && !isspace((unsigned char)s[i])) i++;
        if (j == i) fail("missing value");
        return s.substr(j, i - j);
    }
    string str() {
        ws();
        if (i >= s.size() || (s[i] != '"' && s[i] != '\'')) fail("expected a quoted string");
        char q = s[i++];
        string out;
        while (i < s.size() && s[i] != q) {
            if (s[i] == '\\' && i + 1 < s.size()) {
                char e = s[++i];
                out += e == 'n' ? '\n' : e == 't' ? '\t' : e;
            } else {
                out += s[i];
            }
            i++;
        }
        if (i >= s.size()) fail("unclosed string");
        i++;
        return out;
    }
    template <class N> N number() {
        string t = token();
        try {
            if constexpr (is_floating_point_v<N>) return (N)stod(t);
            else return (N)stoll(t);
        } catch (...) {
            fail("not a number: " + t);
        }
    }
};

template <class T> struct Parse {
    static T get(Reader &r) {
        if constexpr (is_same_v<T, bool>) {
            string t = r.token();
            if (t == "true" || t == "1") return true;
            if (t == "false" || t == "0") return false;
            r.fail("expected true or false");
        } else if constexpr (is_same_v<T, char>) {
            string t = r.str();
            if (t.size() != 1) r.fail("expected one character");
            return t[0];
        } else if constexpr (is_arithmetic_v<T>) {
            return r.template number<T>();
        } else if constexpr (is_same_v<T, string>) {
            return r.str();
        } else {
            static_assert(sizeof(T) == 0, "judge::read can't read this type");
        }
    }
};

template <class T> struct Parse<vector<T>> {
    static vector<T> get(Reader &r) {
        vector<T> v;
        r.expect('[');
        if (r.eat(']')) return v;
        do v.push_back(Parse<T>::get(r)); while (r.eat(','));
        r.expect(']');
        return v;
    }
};

template <> struct Parse<ListNode *> {
    static ListNode *get(Reader &r) {
        ListNode dummy;
        ListNode *tail = &dummy;
        for (int x : Parse<vector<int>>::get(r)) tail = tail->next = new ListNode(x);
        return dummy.next;
    }
};

template <> struct Parse<TreeNode *> {
    static TreeNode *get(Reader &r) {
        vector<TreeNode *> nodes;
        r.expect('[');
        if (!r.eat(']')) {
            do {
                string t = r.token();
                nodes.push_back(t == "null" ? nullptr : new TreeNode(stoi(t)));
            } while (r.eat(','));
            r.expect(']');
        }
        if (nodes.empty() || !nodes[0]) return nullptr;
        size_t child = 1;
        for (size_t p = 0; p < nodes.size() && child < nodes.size(); p++) {
            if (!nodes[p]) continue;
            if (child < nodes.size()) nodes[p]->left = nodes[child++];
            if (child < nodes.size()) nodes[p]->right = nodes[child++];
        }
        return nodes[0];
    }
};

inline string quote(const string &s) {
    string out = "\"";
    for (char c : s) {
        if (c == '"' || c == '\\') out += '\\', out += c;
        else if (c == '\n') out += "\\n";
        else if (c == '\t') out += "\\t";
        else out += c;
    }
    return out + "\"";
}

template <class T> string show(const T &x) {
    if constexpr (is_same_v<T, bool>) {
        return x ? "true" : "false";
    } else if constexpr (is_same_v<T, char>) {
        return quote(string(1, x));
    } else if constexpr (is_integral_v<T>) {
        return to_string(x);
    } else if constexpr (is_floating_point_v<T>) {
        ostringstream o;
        o << fixed << setprecision(5) << x;
        return o.str();
    } else if constexpr (is_same_v<T, string>) {
        return quote(x);
    } else if constexpr (is_same_v<T, ListNode *>) {
        string out = "[";
        int n = 0;
        for (ListNode *p = x; p && n < 10000; p = p->next, n++) out += (n ? "," : "") + to_string(p->val);
        return out + "]";
    } else if constexpr (is_same_v<T, TreeNode *>) {
        vector<string> parts;
        queue<TreeNode *> q;
        if (x) q.push(x);
        while (!q.empty()) {
            TreeNode *n = q.front();
            q.pop();
            if (!n) { parts.push_back("null"); continue; }
            parts.push_back(to_string(n->val));
            q.push(n->left);
            q.push(n->right);
        }
        while (!parts.empty() && parts.back() == "null") parts.pop_back();
        string out = "[";
        for (size_t i = 0; i < parts.size(); i++) out += (i ? "," : "") + parts[i];
        return out + "]";
    } else {
        // Any container: vector, set, deque, ...
        string out = "[";
        bool first = true;
        for (typename T::value_type e : x) {
            out += (first ? "" : ",") + show(e);
            first = false;
        }
        return out + "]";
    }
}

/** Reads one test-input line as a T, e.g. read<vector<int>>() for "[2,7,11,15]". */
template <class T> T read() {
    string line;
    if (!getline(cin, line)) {
        cerr << "Bad test input: a case has fewer lines than the driver reads" << endl;
        exit(3);
    }
    Reader r{line};
    T v = Parse<T>::get(r);
    r.ws();
    if (r.i != line.size()) r.fail("unexpected text after the value");
    return v;
}

/** Runs every case: f reads one case's input and returns the answer to print. */
template <class F> void run(F f) {
    string line;
    getline(cin, line);
    int cases = stoi(line);
    for (int c = 0; c < cases; c++) {
        auto answer = f();
        cout << "\n@@RESULT@@\n" << show(answer) << "\n@@CASE@@\n" << flush;
    }
}
} // namespace judge
