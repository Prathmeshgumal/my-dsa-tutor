class Student:
    # default constructors
    def __init__():
        pass
    college_name = "Vishwakarma Institute of Technology"
    name = "Anil"
    # parameterised constructor
    def __init__(self,name,marks,standard):
        print("adding new student...")
        self.name = name
        self.marks = marks
        self.standard = standard

s1 = Student("Prathmesh",99,"fifth")
print(s1.name,s1.marks,s1.standard)
print(s1.college_name)
# class attributes can also be accessed simpy using their class names 
print(Student.college_name)
print("        ")
print(type(s1.marks))

s2 = Student("Arjun","97","sixth")
print(s2.name,s2.marks,s2.standard)
print(s2.college_name)
print(type(s2.marks))
# Whenever we have a calss and obj attr of the same name the preceedance of obj attr is more than class attr
print(Student.name)
