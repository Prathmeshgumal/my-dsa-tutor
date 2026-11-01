# OOPS

## 1. Class & Object (`OOP.py`)
- **Class** = blueprint. **Object / instance** = a thing built from it.
```python
class Student:
    name = "karan"

s1 = Student()
print(s1)        # <__main__.Student object at 0x...>  (memory location)
print(s1.name)   # karan
```
- Each `Student()` call creates a **new, separate** object (`s1` and `s2` show different addresses).

## 2. Constructor `__init__` (`OOPs-2.py`)
- A constructor is a method that **runs automatically every time an object is created**, to set that new object up.
- Python creates the empty object first, then calls `__init__` on it, then returns it.
- If you don't write one, Python uses a default one that does nothing (you can still add attributes later: `s1.name = "x"`).
- The first parameter is always **`self`**. Python passes it automatically, so you never pass it yourself.
- If `__init__` has required parameters, you **must** pass them: `Student()` → `TypeError`. You can give defaults to make them optional: `def __init__(self, name="karan")`.
```python
class Student:
    def __init__(self, name, marks, standard):
        print("adding new student...")
        self.name = name
        self.marks = marks
        self.standard = standard

s1 = Student("Prathmesh", 99, "fifth")
```

⚠️ **Python has no constructor overloading.** If you write two `__init__` methods, the second one **replaces** the first. So the "default constructor" `def __init__(): pass` in my files is never used (and it's also missing `self`).

## 3. `self`
- `self` = **the object the method is working on**. Inside `__init__` for `s1`, `self` *is* `s1`.
- Same idea as `this` in C++ (a pointer to the current object), but in Python it's written explicitly as a parameter and you use `self.name`, not `this->name`.
- `print(self)` inside `__init__` and `print(s1)` outside show the **same address**.

## 4. Attributes are created by assignment
- No declaration needed: `self.name = name` **creates** the attribute `name` on the object.
- `name` (parameter) is a local variable; `self.name` lives on the object after `__init__` ends.
- `vars(s1)` shows all object attributes: `{'name': 'Prathmesh', ...}`
- Typo danger: `s1.nmae = "x"` silently creates a new attribute (C++ would give a compile error).

## 5. Types belong to values, not attributes
```python
s1 = Student("Prathmesh", 99, "fifth")   # type(s1.marks) -> <class 'int'>
s2 = Student("Arjun", "97", "sixth")     # type(s2.marks) -> <class 'str'>
```
- Python doesn't check types, so the same attribute can hold different types on different objects.
- In C++ `int marks;` is fixed. Passing `"97"` would be a compile error.

## 6. Class attributes vs Instance attributes (`class-and-instance-attr.py`)
- **Class attribute**: defined in the class body, **shared by all objects**.
- **Instance attribute**: set with `self.x = ...`, **separate for each object**.
```python
class Student:
    college_name = "Vishwakarma Institute of Technology"   # class attr
    name = "Anil"                                          # class attr

    def __init__(self, name):
        self.name = name                                   # instance attr

s1 = Student("Prathmesh")
print(s1.college_name)       # via object
print(Student.college_name)  # via class name
print(s1.name)               # Prathmesh  (instance attr wins)
print(Student.name)          # Anil       (class attr)
```
- If an object attribute and a class attribute have the **same name**, `obj.attr` gives the **object's** value first.

## 7. Methods (`OOPS-3.py`)
- A method is a function inside a class. Its first parameter is `self`.
- Call with **parentheses**: `s1.welcome()`. Plain `s1.welcome` only refers to the method and doesn't run it.
- A method can `print` and also `return` a value:
```python
def get_marks(self):
    print(f"{self.name}'s marks are: {self.marks}")
    return self.marks

pg_marks = s1.get_marks()   # prints, then stores 94
```

## 8. f-strings
- Put `f` before the quotes and expressions inside `{}`:
```python
print(f"Welcome {self.name}")
print(f"Next year: {self.marks + 1}")
```
- ❌ `f{"Welcome ", self.name}` is wrong. The braces go **inside** the string.

## 9. Python vs C++ quick comparison
| Concept | Python | C++ |
|---|---|---|
| Constructor | `def __init__(self, ...)` | `Student(...) { }` (same name as class, no return type) |
| Current object | `self` (explicit parameter) | `this` (implicit pointer) |
| Attributes | Created on assignment | Must be declared in class body |
| Attribute type | Any, can differ per object | Fixed at declaration |
| Missing constructor arg | `TypeError` at runtime | Compile error |
| Overloading constructors | ❌ (last `__init__` wins; use default args) | ✅ |
| Privacy | Convention only (`_name`), `@property` | `private` / `public` enforced, getters & setters |

## 10. Static methods & decorators (`static_methods.py`) 🔖 revisit later
- A **decorator** is a function that takes a function as input and returns a function (usually a modified/wrapped version).
- `@decorator` above a function is shorthand for `func = decorator(func)`.
```python
def shout(func):
    def wrapper():
        print("before")
        func()
        print("after")
    return wrapper

@shout
def hello():
    print("Hello MC")
```
- `@staticmethod` marks a method that **doesn't get `self`**. It belongs to the class but doesn't need an object or object data.
```python
class Student:
    @staticmethod
    def hello():
        print("Hello MC")

Student.hello()   # via class
s1.hello()        # also works
```
- Without `@staticmethod`, `s1.hello()` fails with `TypeError ... takes 0 positional arguments but 1 was given` (Python passes `s1` automatically).
- **TODO:** study decorators in more depth (wrappers with arguments, `*args/**kwargs`, `@classmethod`, `@property`).

## 11. Go (Golang)?
- No `class` and no inheritance. It uses **structs + methods**, **interfaces** (satisfied implicitly), **embedding** (composition), and capitalized names for public access.
