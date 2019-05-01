/************************************************
* Author: Riley Harrison
* Description: Implementation of a "small" shell.
* Supports built in commands "cd", "exit",
* and "status". Input/output redirection supported
* as well as some signal handling.
*************************************************/

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/types.h>
#include <signal.h>
#include <sys/wait.h>
#include <fcntl.h>
#include <unistd.h>


#define MAX_CMD_LENGTH 2048
#define MAX_NUM_ARGS 512


//function declarations
void ShellLoop();
void HandleCd(char* input);
void HandleStatus(int* statusNum, char* errorMsg);
void RunBackground(char* input, int* exitStatus, char* errorMsg);
void RunForeground(char* input, int* exitStatus, char* errorMsg);
void checkBgProcesses();
void handleSigTSTP(int sig);
int ContainsString(char* string, char* target);
void TokenizeString(char* string,char** returnArray);
void GetFileName(char* input, char* fileName, char * redir);

//globals
int ignoreBg = 0;//^Z flag
int bgProcesses[1000];
int numProcesses = 0;

/************************************************************
* Description: Main function that runs shell loop.
************************************************************/
int main(){
	ShellLoop();
	return 0;
}

/************************************************************
* Description: main logic of the shell. 
************************************************************/
void ShellLoop(){
	
	int finished = 0;//exit loop flag
	int exitStatus = 0;//status
	char errorMsg[100];
	memset(errorMsg,0,100);
	
	//set up signal handler for SIGTSTP
	struct sigaction actTSTP;
	sigfillset(&(actTSTP.sa_mask));
	actTSTP.sa_flags = SA_RESTART;
	actTSTP.sa_handler = handleSigTSTP;
	sigaction(SIGTSTP,&actTSTP,NULL);
		
	while(finished == 0){
		//check if any bg processes have completed
		checkBgProcesses();

		//prompt user
		printf(": ");
		fflush(stdout);

		//get input
		char input [MAX_CMD_LENGTH];
		fgets(input,sizeof(input),stdin);
		input[strlen(input) - 1] = '\0';
		
		//check for comments
		if (input[0] == '#'){
			continue;
		}	
		
		//check for empty input
		else if (strcmp(input,"") == 0){
			continue;
		}

		//check if cd was entered
		else if (input[0]=='c' && input[1] == 'd'){//had to do this due to "echo cd" triggering HandleCD
			HandleCd(input);
		}
		
		//check if status was entered
		else if (ContainsString(input,"status")){
			HandleStatus(&exitStatus,errorMsg);
		}
	
		//check if exit was entered
		else if (strcmp(input,"exit")==0){
			int i=0;
			for(i=0;i<numProcesses;i++){
				kill(bgProcesses[i],SIGTERM);
			}
			finished=1;
			exit(0);
		}
		

		//check if background "&" was the last character
		else if (input[strlen(input)-1] == '&'){
			if(ignoreBg){//foreground only mode
				RunForeground(input,&exitStatus,errorMsg);
			}
			else{
				RunBackground(input,&exitStatus,errorMsg);
			}
		}
	
		//otherwise run foreground process
		else{
			RunForeground(input,&exitStatus,errorMsg);
		}
	}

}



/************************************************************
* Description: handles cd command   
************************************************************/
void HandleCd(char* input){
	//only "cd" was entered
	if (strlen(input) == 2){
		chdir(getenv("HOME"));//cd to home env variable
	}
	//arguments entered
	else{
		//grab arguments
		char* inputArgs[MAX_NUM_ARGS];
		TokenizeString(input,inputArgs);
	
		//attempt to change directory
		int chdirReturn = chdir(inputArgs[1]);
		if(chdirReturn != 0){//if chdir fails, print error.
			printf("smallsh: %s: No such file or directory\n",inputArgs[1]);
			fflush(stdout);
		}	
	}
	
}

/************************************************************
* Description: handles status command
************************************************************/
void HandleStatus(int *statusNum, char* errorMsg){
	if (strcmp(errorMsg,"")==0){
		printf("exit value %d\n",*statusNum);

	}
	else{
		printf("%s\n",errorMsg);
		memset(errorMsg,0,100);
	}			
	fflush(stdout);
	*statusNum = 0;
}


/************************************************************
* Description: handles background processes
************************************************************/
void RunBackground(char* input, int* exitStatus, char* errorMsg){
	int status = -5;
	pid_t spawnPid = -5;
	int file = -1;//for output redirection
	int file2 = -1;//input redirection
	char fileName[100]={'\0'};
	char pid[10] = {'\0'};//bg pid

	//see if we have any redirection going on
	int hasOutputRe = ContainsString(input," > ");
	int hasInputRe = ContainsString(input, " < ");
	
	//convert user input into an argument array
	char* inputArgs[MAX_NUM_ARGS]={NULL};
	TokenizeString(input,inputArgs);

	//if there is output redirection, open up a file for output redirection
	if(hasOutputRe){
		GetFileName(input,fileName,">");
		file = open(fileName, O_WRONLY|O_TRUNC|O_CREAT,0777);
		if(file < 0){//open failed
			printf("smallsh: failed to open file: %s\n",fileName);
			fflush(stdout);
		}
		else{//open success, set close on exec
			fcntl(file,F_SETFD, FD_CLOEXEC);
		}

	}
	else{//no output file specified
		file=open("/dev/null",O_WRONLY);
		fcntl(file,F_SETFD,FD_CLOEXEC);
	}
	
	//if input redirection, open up file for output redirection
	if(hasInputRe){
		GetFileName(input,fileName,"<");
		file2 = open(fileName, O_RDONLY);
		if(file2 < 0){
			printf("smallsh: failed to open file: %s\n",fileName);
			fflush(stdout);
		}
		else{
			fcntl(file2,F_SETFD, FD_CLOEXEC);
		}
	}
	else{//no input file specified
		file2=open("/dev/null",O_RDONLY);
		fcntl(file2,F_SETFD,FD_CLOEXEC);
	}
	
	//fork off a process to handle exec
	spawnPid = fork();

	switch(spawnPid){

		case -1://fork failed
			exit(1);
			break;

		case 0://child process
			if(hasOutputRe){
				int success = dup2(file,1);//redirect stdout
				if(success < 0){//dup2 failed
					*exitStatus = 1;
					exit(1);
				}
			}

			if(hasInputRe){
				int success2 = dup2(file2,0);//redirect stdin
				if (success2 < 0){//dup2 failed
					*exitStatus = 1;
					exit(1);	
				}	
			}

			//execute command	
			execvp(inputArgs[0],inputArgs);		
			//exec failed if below lines run.
			printf("smallsh: command not not be executed.\n");
			fflush(stdout);
			*exitStatus = 1;
			exit(1);
			break;	
		
		default://parent process
			//print success message with the pid of the child
			snprintf(pid,sizeof(pid),"%d",spawnPid);
			printf("background pid is %s\n",pid);
			fflush(stdout);
			//add to global array so child can be waited on in checkProcesses
			bgProcesses[numProcesses] = (int)spawnPid;
			numProcesses++;
	}


}

/************************************************************
* Description: handles foreground processes
************************************************************/
void RunForeground(char* input, int* exitStatus, char* errorMsg){
	int status = -5;
	pid_t spawnPid = -5;

	int file = -1;//for output redirection
	int file2 = -1;//input redirection
	char fileName[100]={'\0'};

	//see if we have any redirection going on
	int hasOutputRe = ContainsString(input," > ");
	int hasInputRe = ContainsString(input, " < ");
	
	//convert user input into an argument array
	char* inputArgs[MAX_NUM_ARGS]={NULL};
	TokenizeString(input,inputArgs);

	//if there is output redirection, open up a file for output redirection
	if(hasOutputRe){
		GetFileName(input,fileName,">");
		file = open(fileName, O_WRONLY|O_TRUNC|O_CREAT,0777);
		if(file < 0){//open failed
			printf("smallsh: failed to open file: %s\n",fileName);
			fflush(stdout);
		}
		else{//open success, set close on exec
			fcntl(file,F_SETFD, FD_CLOEXEC);
		}

	}
	
	//if input redirection, open up file for output redirection
	if(hasInputRe){
		GetFileName(input,fileName,"<");
		file2 = open(fileName, O_RDONLY);
		if(file2 < 0){
			printf("smallsh: failed to open file: %s\n",fileName);
			fflush(stdout);
		}
		else{
			fcntl(file2,F_SETFD, FD_CLOEXEC);
		}
	}
	
	//set up handler for sig_int
	struct sigaction act;
	sigfillset(&(act.sa_mask));
	act.sa_flags = SA_RESTART;

	
	//fork off a process to handle exec
	spawnPid = fork();

	switch(spawnPid){

		case -1://fork failed
			exit(1);
			break;

		case 0://child process
			act.sa_handler=SIG_DFL;//we want sigInt to terminate process in the child
			sigaction(SIGINT,&act,NULL);
			if(hasOutputRe){
				int success = dup2(file,1);//redirect stdout
				if(success < 0){//dup2 failed
					*exitStatus = 1;
					exit(0);
				}
			}

			if(hasInputRe){
				int success2 = dup2(file2,0);//redirect stdin
				if (success2 < 0){//dup2 failed
					*exitStatus = 1;
					exit(1);	
				}	
			}

			//execute command	
			execvp(inputArgs[0],inputArgs);		
			printf("smallsh: command not not be executed.\n");
			fflush(stdout);
			*exitStatus = 1;
			exit(1);
			break;	
		
		default://parent process

			//have parent ignore interrupt signals.  Child processes will term.
			act.sa_handler=SIG_IGN;
			sigaction(SIGINT,&act,NULL);
			waitpid(spawnPid,&status,0);//wait for child process
			*exitStatus=WEXITSTATUS(status);//set exit status
			
			//check if process was terminated by a signal.
			if(WIFSIGNALED(status)){
				int signal=WTERMSIG(status);
				snprintf(errorMsg,100,"foreground process terminated by signal %d\n",signal);
				printf("%s",errorMsg);
				fflush(stdout);
			}			
	}


}

/************************************************************
* Description: checks if processes running in the background
* have completed and are ready to be waited on.
************************************************************/
void checkBgProcesses(){
	int status;
	int i;
	//loop through process array
	for (i=0;i<numProcesses;i++){
		if(waitpid(bgProcesses[i],&status,WNOHANG) > 0){//process has completed
			if(WIFSIGNALED(status) != 0){//if a signal killed the process
				printf("background pid %d is done: terminated by signal %d\n",
					bgProcesses[i],WTERMSIG(status));
			}
			if(WIFEXITED(status) != 0){//if exited normally
				printf("background pid %d is done: exit status %d\n",
					bgProcesses[i],WEXITSTATUS(status));
			}
			fflush(stdout);
		}
	}


}

/************************************************************
* Description: Signal handler for TSTP signal. ^Z
* flips the global ignoreBg flag and prints the corrosponding
* message to the user.
************************************************************/
void handleSigTSTP(int sig){
	if(ignoreBg == 1){
		char * message = "\nExiting foreground-only mode\n: ";		
		write(1,message,32);
		ignoreBg = 0;
	}
	else{
		char * message = "\nEntering foreground-only mode (& is now ignored)\n: ";
		write(1,message,52);
		ignoreBg = 1;
	}
}


/************************************************************
* Description: checks if a string is contained within another
* string and returns 1(true), or 0(false) 
************************************************************/
int ContainsString(char * string, char * target){
	//see if target string exists in "string"
	if (strstr(string,target) != NULL){
		return 1;//exists in string
	}
	return 0;//does not
}

/************************************************************
* Description: Breaks up a string into an array of strings.
* Delimited by whitespace
*********i***************************************************/
void TokenizeString(char* string, char** returnArr){
 	int i = 0;
	//strtok messes with original string.  Save it in temp var
	char originalString[MAX_CMD_LENGTH];
	memset(originalString,'\0',MAX_CMD_LENGTH);
	strcpy(originalString,string);

	//first check if $$ is in the string
	if(ContainsString(string,"$$")){
		char pid[10];
		memset(pid,0,10);
		snprintf(pid,sizeof(pid),"%d",(int)getpid());
		
		//replace where $$ occurs with the pid
		char*result = strstr(string,"$$");
		int index = result - string;
		int j,p;
		p=0;
		for (j=index; j<(index + sizeof(pid)); j++){
			string[j] = pid[p];
			p++;
		}	
	}
	char tempStr[MAX_CMD_LENGTH];
	strcpy(tempStr,string);	

	//grab first token
	i=0;
	char* token;
	token = strtok(tempStr, " ");
	int redirFlag = 0;
	
	//tokenize until NULL
	while(token != NULL){
		//stop tokenizing if we have hit max num of args
		if(i > MAX_NUM_ARGS){
			printf("Exeeded maximum number of arguments.");
			printf("Using first %d arguments.\n",MAX_NUM_ARGS);
			fflush(stdout);
			break;
		}
		
		if (redirFlag == 1){ //last token was a redirect symbol
			redirFlag = 0;//do nothing this round and reset flag
		}

		else{//last symbol was not a redirect
			if (strcmp(token,"<") != 0 && strcmp(token,">") !=0){ 
				//check for background symbol
				if(strcmp(token,"&") != 0){
					//add to returnArr
					returnArr[i]=token;
					i++;
				}
			}
			else{
				redirFlag = 1;//set flag so we do not add the next token (file)
			}
		}
		
		//attempt to grab next token
		token = strtok(NULL," ");
	}	
}

/************************************************************
* Description: Gets the file name from user input. 
* Sets fileName to the token immediately following redirection
* symbols < >  
************************************************************/
void GetFileName(char* input, char* fileName, char * redir){

	//save a copy of input.  Use for strtok()	
	char originalString[MAX_CMD_LENGTH];
	memset(originalString,'\0',MAX_CMD_LENGTH);
	strcpy(originalString,input);
	
	//grab first token
	int redirFound = -5;
	char* token;
	token = strtok(originalString, " ");
		

	//tokenize until NULL
	while(token != NULL){
		//we found redirect symbol last loop
		if (redirFound == 0){
			strcpy(fileName,token);// next token is file we want
			break;
		}
		//check for redirect
		if (strcmp(token,redir) == 0){
			redirFound = 0;
		}
		//attempt to grab next token
		token = strtok(NULL," ");
	}	

}

