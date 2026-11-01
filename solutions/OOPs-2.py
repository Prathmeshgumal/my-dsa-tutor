class Student:
    # default constructors
    def __init__():
        pass

    # parameterised constructor
    def __init__(self,name,marks,standard):
        print("adding new student...")
        self.name = name
        self.marks = marks
        self.standard = standard

s1 = Student("Prathmesh",99,"fifth")
print(s1.name,s1.marks,s1.standard)
print(type(s1.marks))

s2 = Student("Arjun","97","sixth")
print(s2.name,s2.marks,s2.standard)
print(type(s2.marks))