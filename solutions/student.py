class Student:
    def __init__(self,name,eng_marks,sci_marks,maths_marks):
        self.name=name
        self.eng_marks=eng_marks
        self.sci_marks=sci_marks
        self.maths_marks=maths_marks

    def avg(self):
        average = (self.eng_marks+self.sci_marks+self.maths_marks)/3
        return average

s1=Student("Prathmesh",99,97,94)
a = s1.avg()
print(a)