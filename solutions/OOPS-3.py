class Student:
    college_name = "Vishwakarma institute of Technology"

    def __init__(self, name, marks):
        self.name = name
        self.marks = marks

    def welcome(self):
        print(f"Welcome {self.name}")

    def get_marks(self):
        print(f"{self.name}'s marks are: {self.marks}")
        return self.marks


s1 = Student("Prathmesh",94)
s1.welcome()
pg_marks = s1.get_marks()
print(pg_marks)
